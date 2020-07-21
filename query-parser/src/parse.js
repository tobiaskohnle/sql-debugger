'use strict';

class SQLError extends Error {
    constructor(message) {
        super(message);
        this.name = SQLError.name;
        this.error_range = stream.currrent_range();
    }

    static raise(message) {
        throw new SQLError(message);
    }
}

function token_stream(tokens) {
    let token_index = 0;
    let saved_token_index = 0;

    return {
        _tokens: tokens,

        get current_index() {
            return tokens[token_index]?.range[0] ?? tokens.last()?.range[1] ?? 0;
        },
        currrent_range() {
            return tokens[token_index]?.range ?? (tokens.last() ? [tokens.last().range[1],Infinity] : null) ?? [0,1];
        },

        end_of_input(offset=+0) {
            return token_index+offset >= tokens.length;
        },
        peek(offset=+0) {
            if (this.end_of_input(offset)) {
                return SQLError.raise('unexpected end of input');
            }

            return tokens[token_index+offset];
        },
        next() {
            let next;
            return next=this.peek(), token_index++, next;
        },

        next_is_all(...values_and_types) {
            console.assert(values_and_types.length%2 == 0);

            return Array(values_and_types.length/2).fill().every((_,i) =>
                this.next_is(...values_and_types.slice(i*2,i*2 + 2), i)
            );
        },
        next_if_all(...values_and_types) {
            if (this.next_is_all(...values_and_types)) {
                return Array(values_and_types.length/2).fill().map(() => this.next());
            }

            return null;
        },
        next_is(token_value,token_type, offset=+0) {
            return !this.end_of_input(offset) && this.peek(offset).is(token_value,token_type);
        },
        next_if(token_value,token_type) {
            if (this.next_is(token_value,token_type)) {
                return this.next();
            }

            return null;
        },

        expect(token_value,token_type, error_message) {
            if (!this.next_is(token_value,token_type)) {
                return SQLError.raise(error_message);
            }

            return this.next();
        },
    };
}

function parse_list_of(parse_item, can_be_empty=false) {
    const list = [];

    const initial_item = can_be_empty ? optional(parse_item) : parse_item();

    if (initial_item == null) {
        return list;
    }

    list.push(initial_item);

    while (stream.next_if(',')) {
        const item = optional(parse_item);

        if (item == null) {
            break;
        }

        list.push(item);
    }

    return list;
}

let stream;
let in_debug_mode;
let current_query_text;

function init_stream_and_parse_query_statement(query_text) {
    stream = token_stream(tokens(query_text));
    current_query_text = query_text;

    return parse_query_statement();
}

function parse_query_statement() {
    in_debug_mode = !!stream.next_if('debug');
    if (in_debug_mode) {
        console.clear();
        console.log('%cDebug Mode', 'color:#f23;font-style:italic');
    }

    let debug_command;
    if (debug_command = stream.next_if('load', 'debug')) {
        return {type:'load', name:parse_identifier()};
    }
    if (debug_command = stream.next_if(null, 'debug')) {
        return {type: debug_command.value};
    }

    const query = parse_query();

    stream.next_if(';');

    if (!stream.end_of_input()) {
        SQLError.raise('expected end of input');
    }

    return query;
}
parse_query_statement = wrap_add_range(parse_query_statement);

function set_range(element, start_index,end_index) {
    const end_index_offset = current_query_text.substring(start_index,end_index).match(/\s*$/)[0].length;

    element.range = [
        start_index,
        end_index-end_index_offset,
    ];

    return element;
}

function wrap_add_range(parse_function) {
    return function(...args) {
        const start_index = stream.current_index;
        const result = parse_function(...args);
        const end_index = stream.current_index;

        set_range(result, start_index,end_index);

        return result;
    };
}

function optional(parse_function, ...parse_arguments) {
    let index_before = stream.current_index;

    try {
        return parse_function(...parse_arguments);
    }
    catch (error) {
        if (error.name != SQLError.name) {
            throw error;
        }

        // if ANY token has been consumed,
        // a parse function can NOT be optional
        if (index_before != stream.current_index) {
            throw error;
        }

        return null;
    }
}

function _expr_str(e) {
    if (e.type == 'binary_operation') {
        return `(${_expr_str(e.left)} ${e.operator.operator.operator} ${_expr_str(e.right)})`;
    }
    if (e.type == 'unary_operation') {
        if (e.operator.operator.is_right_associative) {
            return `(${e.operator.operator.operator} ${_expr_str(e.operand)})`;
        }
        return `(${_expr_str(e.operand)} ${e.operator.operator.operator})`;
    }
    if (e.type == 'number') {
        return `${e.value.match}`;
    }
    if (e.type == 'group') {
        return `[${_expr_str(e.group)}]`;
    }
    if (e.type == 'function_call') {
        return `(${_expr_str(e.function)} (${_expr_str(e.function_argument)}))`;
    }
    return `${e}`;
}

function parse_compound_query(left_query) {
    if (!left_query.range) debugger;

    let operator;
    let compound_info;

    if (operator = stream.next_if('union', 'keyword')) {
        compound_info = {
            type: 'union',
            all: stream.next_if('all', null),
        };
    }
    else if (operator = stream.next_if('intersect', 'keyword')) {
        compound_info = {
            type: 'intersect',
            all: stream.next_if('all', null),
        };
    }
    else if (operator = stream.next_if('except', 'keyword')) {
        compound_info = {
            type: 'except',
            all: stream.next_if('all', null),
        };
    }
    else {
        SQLError.raise('expected compound operator');
    }

    const compound_query = {
        type: 'compound',
        compound: {
            ...compound_info,

            left_query,
            right_query: parse_single_select_query(),

            operator,
        },
    };
    set_range(compound_query, left_query.range[0],stream.current_index);

    return optional(parse_compound_query, compound_query) ?? compound_query;
}
parse_compound_query = wrap_add_range(parse_compound_query);
function parse_single_select_query() {
    if (stream.next_if('(')) {
        const subquery = parse_query();

        stream.expect(')', null, 'expected closing parentheses');
        return subquery;
    }

    return {
        type: 'select_query',
        select: parse_select_statement(),
        from: optional(parse_from_statement),
        where: optional(parse_where_statement),
        ...(optional(parse_group_by_and_having_statement) ?? {}),
    };
}
parse_single_select_query = wrap_add_range(parse_single_select_query);

function parse_select_query() {
    const select_query = parse_single_select_query();
    return optional(parse_compound_query, select_query) ?? select_query;
}
parse_select_query = wrap_add_range(parse_select_query);
function parse_query() {
    return {
        type: 'query',
        select_query: parse_select_query(),
        order_by: optional(parse_order_by_statement),
        limit: optional(parse_limit_statement),
    };
}
parse_query = wrap_add_range(parse_query);

function parse_identifier() {
    return stream.expect(null, 'identifier', 'expected identifier').value;
}
function parse_name() {
    return stream.next_if(null, 'identifier')
        ?? stream.expect(null, 'string', 'expected name');
}
function parse_alias() {
    stream.next_if('as', null);
    return parse_name();
}
function parse_field_reference() {
    const a = parse_identifier();

    if (stream.next_if('.')) {
        const b = parse_identifier();

        if (stream.next_if('.')) {
            const c = parse_identifier();

            return {
                type: 'field',
                database: a,
                table: b,
                field: c,
            };
        }

        return {
            type: 'field',
            table: a,
            field: b,
        };
    }

    return {
        type: 'field',
        field: a,
    };
}
parse_field_reference = wrap_add_range(parse_field_reference);
function parse_table_reference() {
    const a = parse_identifier();

    if (stream.next_if('.')) {
        const b = parse_identifier();
        return {
            type: 'table',
            database: a,
            table: b,
        };
    }

    return {
        type: 'table',
        table: a,
    };
}
parse_table_reference = wrap_add_range(parse_table_reference);
function parse_function_argument() {
    return {
        distinct: stream.next_if('distinct', 'keyword'),
        argument: parse_expression(),
    };
}
parse_function_argument = wrap_add_range(parse_function_argument);
function parse_selector_value() {
    let selector_value;

    let value_token;
    if (value_token=stream.next_if(null, 'number')) {
        selector_value = {
            type: 'number',
            value: value_token,
        };
    }
    else if (value_token=stream.next_if(null, 'string')) {
        selector_value = {
            type: 'string',
            value: value_token,
        };
    }
    else if (stream.next_is(null, 'identifier') || stream.next_is(null, 'string')) {
        selector_value = parse_field_reference();
    }
    else if (stream.next_is(null, 'aggregate_function')) {
        selector_value = stream.next();
    }
    else {
        selector_value = optional(parse_field_reference) ?? SQLError.raise('expected selector value');
    }

    if (stream.next_if('(')) {
        const function_arguments = [];

        if (stream.next_is('*') || stream.next_is_all('distinct', 'keyword', '*', null)) {
            function_arguments.push({
                distinct: stream.next_if('distinct', 'keyword'),
                argument: {
                    expr: parse_field_selector().field,
                },
            });
        }
        else {
            function_arguments.push(...parse_list_of(parse_function_argument, true));
        }

        selector_value = {
            type: 'function_call',
            function: selector_value,
            function_arguments,
        };
        stream.expect(')', null, 'expected closing parentheses');
    }

    let operator;
    if (operator = stream.next_if('in', 'keyword')) {
        selector_value = {
            type: 'value_in',
            left: selector_value,
            operator_token: operator,
            right: parse_query_or_value_list(),
        };
    }
    else if (
        operator = stream.next_if_all(null, 'operator', 'any', 'keyword')
                ?? stream.next_if_all(null, 'operator', 'some', 'keyword')
                ?? stream.next_if_all(null, 'operator', 'all', 'keyword')
    ) {
        const [operator_token, any_or_every] = operator;

        find_operator(
            operator_token,
            {is_binary:true, is_right_associative:false},
            {is_binary:true, is_right_associative:true},
        );

        selector_value = {
            type: 'any_or_every_value',
            left: selector_value,
            operator_token,
            all: any_or_every.value == 'all',
            right: parse_query_or_value_list(),
        };
    }

    return selector_value;
}
parse_selector_value = wrap_add_range(parse_selector_value);

function parse_field_selector() {
    const start_index = stream.current_index;

    if (stream.next_if('*')) {
        return set_range({
            field: {
                type: 'field',
                table: null,
                field: null,
            },
        }, start_index,stream.current_index);
    }
    if (stream.next_is_all(null, 'identifier', '.', null, '*', null)) {
        const a = parse_identifier();
        stream.next(); // '.'
        stream.next(); // '*'

        return set_range({
            field: {
                type: 'field',
                table: a,
                field: null,
            },
        }, start_index,stream.current_index);
    }

    return {
        type: 'field_selector',
        field: parse_expression(),
        as: optional(parse_alias),
    };
}
parse_field_selector = wrap_add_range(parse_field_selector);
function parse_query_or_value_list() {
    let table;

    stream.expect('(', null, 'expected opening parentheses');

    if (stream.next_is('select', 'keyword')) {
        table = parse_query();
    }
    else {
        table = {
            type: 'value_list',
            values: parse_list_of(parse_expression, true),
        };
    }

    stream.expect(')', null, 'expected closing parentheses');

    return table;
}
parse_query_or_value_list = wrap_add_range(parse_query_or_value_list);
function parse_table_selector() {
    const table_selector = parse_single_table_selector();
    return optional(parse_joined_table_selector, table_selector) ?? table_selector;
}
parse_table_selector = wrap_add_range(parse_table_selector);
function parse_single_table_selector() {
    let table;

    if (stream.next_if('(')) {
        if (stream.next_is('select', 'keyword')) {
            table = parse_query();
        }
        else {
            table = parse_table_selector();
        }

        stream.expect(')', null, 'expected closing parentheses');
    }
    else {
        table = parse_table_reference();
    }

    return {
        type: 'table_selector',
        table,
        as: optional(parse_alias),
    };
}
parse_single_table_selector = wrap_add_range(parse_single_table_selector);
function parse_joined_table_selector(left_table) {
    const join_operator
        = stream.next_if('join')
        ?? stream.next_if('inner join')

        ?? stream.next_if('left join')
        ?? stream.next_if('left outer join')

        ?? stream.next_if('right join')
        ?? stream.next_if('right outer join')

        ?? stream.next_if('full join')
        ?? stream.next_if('full outer join')

        ?? SQLError.raise('expected join operator');

    const right_table = parse_single_table_selector();

    let join_constraint = null;
    if (stream.next_if('on', 'keyword', 'expected join constraint')) {
        join_constraint = parse_expression();
    }

    const joined_table = {
        type: 'join_tables',
        left_table,
        right_table,
        join_operator,
        join_constraint,
    };
    set_range(joined_table, left_table.range[0],stream.current_index);

    return optional(parse_joined_table_selector, joined_table) ?? joined_table;
}
parse_joined_table_selector = wrap_add_range(parse_joined_table_selector);

function parse_select_statement() {
    stream.expect('select', 'keyword', 'expected select');
    stream.next_if('all');

    const distinct = stream.next_if('distinct', 'keyword');

    return {
        distinct,
        selectors: parse_list_of(parse_field_selector),
    };
}
parse_select_statement = wrap_add_range(parse_select_statement);
function parse_from_statement() {
    stream.expect('from', 'keyword', 'expected from');
    return parse_list_of(parse_table_selector);
}
parse_from_statement = wrap_add_range(parse_from_statement);

function parse_where_statement() {
    stream.expect('where', 'keyword', 'expected where');
    return parse_expression();
}
parse_where_statement = wrap_add_range(parse_where_statement);

function parse_group_by_statement() {
    stream.expect('group by', 'keyword', 'expected group by');
    return parse_list_of(parse_expression);
}
parse_group_by_statement = wrap_add_range(parse_group_by_statement);
function parse_having_statement() {
    stream.expect('having', 'keyword', 'expected having');
    return parse_expression();
}
parse_having_statement = wrap_add_range(parse_having_statement);
function parse_group_by_and_having_statement() {
    return {
        group_by: parse_group_by_statement(),
        having: optional(parse_having_statement),
    };
}
parse_group_by_and_having_statement = wrap_add_range(parse_group_by_and_having_statement);

function parse_order_statement() {
    return {
        order_by: parse_expression(),
        order: stream.next_if('asc', 'keyword') ?? stream.next_if('desc', 'keyword') ?? null,
    };
}
parse_order_statement = wrap_add_range(parse_order_statement);
function parse_order_by_statement() {
    stream.expect('order by', 'keyword', 'expected order by');
    return parse_list_of(parse_order_statement);
}
parse_order_by_statement = wrap_add_range(parse_order_by_statement);

function parse_limit_statement() {
    stream.expect('limit', 'keyword', 'expected limit');
    return parse_expression();
}
parse_limit_statement = wrap_add_range(parse_limit_statement);

function find_operator(operator_token, ...possible_operator_types) {
    for (const operator of OPERATORS) {
        for (const {is_binary,is_right_associative} of possible_operator_types) {
            if (strings_equal_ignore_case(operator.operator, operator_token.value)) {
                if (operator.is_binary==is_binary && operator.is_right_associative==is_right_associative) {
                    return operator;
                }
            }
        }
    }
}
function parse_expression() {
    function* parse_expression_tokens() {
        const value_start = 0;
        const value_end = 1;

        let indent = 0;

        let state = value_start;

        while (!stream.end_of_input()) switch (state) {
            case value_start: {
                if (stream.next_if('(')) {
                    if (stream.next_is('select', 'keyword')) {
                        yield parse_query();
                        stream.expect(')', null, 'expected closing parentheses');

                        state = value_end;
                    }
                    else {
                        indent++;
                        yield {type:'('};
                    }
                }
                else if (stream.next_is(null, 'operator')) {
                    const operator_token = stream.peek();
                    const operator = find_operator(
                        operator_token,
                        {is_binary:false, is_right_associative:true},
                    );

                    if (!operator) {
                        SQLError.raise('invalid operator before value');
                    }

                    stream.next();

                    if (operator.is_binary) {
                        state = value_end;
                    }
                    yield {type:'operator', operator, operator_token};
                }
                else {
                    state = value_end;
                    yield parse_selector_value();
                }

                break;
            }

            case value_end: {
                if (stream.end_of_input()) {
                    return;
                }
                else if (indent>0 && stream.next_if(')')) {
                    indent--;
                    yield {type:')'};
                }
                else if (stream.next_is(')')) {
                    return;
                }
                else if (stream.next_is(null, 'operator')) {
                    const operator_token = stream.peek();
                    const operator = find_operator(
                        operator_token,
                        {is_binary:true, is_right_associative:true},
                        {is_binary:true, is_right_associative:false},
                        {is_binary:false, is_right_associative:false},
                    );

                    if (!operator) {
                        SQLError.raise('invalid operator after value');
                    }

                    stream.next();

                    if (operator.is_binary) {
                        state = value_start;
                    }
                    yield {type:'operator', operator, operator_token};
                }
                else {
                    return;
                }

                break;
            }
        }

        if (state == value_start) {
            SQLError.raise('unexpected end of expression');
        }
        if (indent > 0) {
            if (state == value_end) {
                SQLError.raise('expected closing paretheses');
            }
            SQLError.raise('unexpected end of expression');
        }
    }

    function unwrap_token_stack(token_stack, while_precedence_greater_than) {
        while (true) {
            // v + v
            if (token_stack.length>=3 && token_stack.get(-3).type!='operator' && token_stack.get(-2).type=='operator' && token_stack.get(-1).type!='operator') {
                if (token_stack.get(-2).operator.precedence < while_precedence_greater_than) {
                    break;
                }

                let operation;
                token_stack.push(operation = {
                    type: 'binary_operation',

                    right: token_stack.pop(),
                    operator_token: token_stack.last().operator_token,
                    operator: token_stack.pop(),
                    left: token_stack.pop(),
                });

                if (operation.operator_token.value == 'between') {
                    operation.type = 'value_between';

                    if (operation.right.type != 'binary_operation') {
                        SQLError.raise('invalid between syntax');
                    }
                    if (operation.right.operator_token.value != 'and') {
                        SQLError.raise('invalid between syntax');
                    }

                    operation.min = operation.right.left;
                    operation.max = operation.right.right;
                    delete operation.right;
                }

                set_range(operation, operation.left.range[0],(operation.right ?? operation.max).range[1]);
            }
            // - v
            else if (token_stack.length>=2 && token_stack.get(-2).type=='operator' && token_stack.get(-1).type!='operator') {
                if (token_stack.get(-2).operator.precedence < while_precedence_greater_than) {
                    break;
                }

                let operation;
                token_stack.push(operation = {
                    type: 'unary_operation',

                    operand: token_stack.pop(),
                    operator_token: token_stack.last().operator_token,
                    operator: token_stack.pop(),
                });

                set_range(operation, operation.operator_token.range[0],operation.operand.range[1]);
            }
            // v %
            else if (token_stack.length>=2 && token_stack.get(-2).type!='operator' && token_stack.get(-1).type=='operator') {
                if (token_stack.get(-1).operator.precedence < while_precedence_greater_than) {
                    break;
                }

                let operation;
                token_stack.push(operation = {
                    type: 'unary_operation',

                    operator_token: token_stack.last().operator_token,
                    operator: token_stack.pop(),
                    operand: token_stack.pop(),
                });

                set_range(operation, operation.operand.range[0],operation.operator_token.range[1]);
            }
            else {
                break;
            }
        }
    }

    const expression_tokens = Array.from(parse_expression_tokens());

    // set actual precedence
    expression_tokens.forEach((token,index) => {
        if (!token.operator) return;

        token.operator = {
            ...token.operator,
            precedence: 10000*token.operator.precedence + (token.operator.is_right_associative ? index : tokens.length-index-1),
        };
    });
    //
    for (let i = 0; i < 2*expression_tokens.length; i++) {
        expression_tokens.forEach((token,i) => {
            if (token.operator && !token.operator.is_binary) {
                const next_operator = expression_tokens[token.operator.is_right_associative ? i-1 : i+1];
                if (!next_operator || !next_operator.operator) return;

                const higher_precedence = next_operator.operator.precedence+1;

                if (higher_precedence > token.operator.precedence) {
                    token.operator.precedence = higher_precedence;
                    token.operator_precedence_changed = true;
                }
            }
        });
    }
    //

    let token_index = 0;

    return {expr: (function create_tree(token_stack=[]) {
        while (token_index < expression_tokens.length) {
            const token = expression_tokens[token_index];

            if (token.type == 'operator') {
                unwrap_token_stack(token_stack, token.operator.precedence);
            }
            else if (token.type == '(') {
                token_index++; // '('
                // token_stack.push({
                //     type: 'group',
                //     group:create_tree(),
                // });
                token_stack.push(create_tree());
                token_index++; // ')'
                continue;
            }
            else if (token.type == ')') {
                break;
            }

            token_stack.push(token);
            token_index++;
        }

        unwrap_token_stack(token_stack, -Infinity);

        return get_only_value(
            token_stack,
            `failed to parse expression`,
            `failed to parse expression`,
        );
    })()};
}
parse_expression = wrap_add_range(parse_expression);
