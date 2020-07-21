'use strict';

let _i = 0;
let _cached_queries = [];

function init_and_run_query(query) {
    debug_reset_steps();
    return run_query(query);
}

function run_query(query, _step_parent=null) {
    const _step_run_query = debug_open_step(_step_parent, 'run query', query, new Table);

    if (query.cache_id == null) {
        query.cache_id = _cached_queries.length;
    }
    if (_cached_queries[query.cache_id]) {
        return _cached_queries[query.cache_id];
    }

    let timer_name;
    if (in_debug_mode) {
        console.groupCollapsed('%crun_query', 'color:#ff5');
        console.log('%cquery', 'color:#ff5', query);
        timer_name = `eval ${_i++} took`;
        console.time(timer_name);
    }

    const result_table = run_select_query(query.select_query, _step_run_query);

    // ORDER BY
    if (query.order_by) {
        const _step_order_by = debug_open_step(_step_run_query, 'order by', query.order_by, result_table);

        let unsorted_rows = result_table.rows.copy();
        const sorted_rows = unsorted_rows.copy().sort((row_a,row_b) => {
            for (let i = 0; i < query.order_by.length; i++) {
                set_order_values(row_a, i);
                set_order_values(row_b, i);

                const value_a = row_a.order_values[i];
                const value_b = row_b.order_values[i];

                const dir = query.order_by[i].order?.value == 'desc' ? -1 : 1;

                if (value_a < value_b) return -dir;
                if (value_a > value_b) return dir;
            }

            return 0;
        });

        function set_order_values(row, index) {
            if (!row.order_values) {
                row.order_values = [];
            }
            if (!row.order_values[index]) {
                const order_by_expression = query.order_by[index].order_by.expr;
                row.order_values[index] = value_of(order_by_expression, result_table.fields, row, null, {inner_steps:[]});
            }
        }

        for (let i = 0; i < unsorted_rows.length; i++) {
            debug_single_step(_step_order_by, 'order by move row', query.order_by, null, () => {
                let j = unsorted_rows.indexOf(sorted_rows[i]);

                move_row_animated(j, i);
                unsorted_rows.splice(i,0, ...unsorted_rows.splice(j,1));
            }, () => {
                highlight_row_animated(i);
            });
        }

        result_table.rows = sorted_rows.copy();
        debug_close_step(_step_order_by, null, null);
    }

    // LIMIT
    if (query.limit) {
        debug_single_open_step(_step_run_query, 'limit', query.limit, result_table, () => {
            delete_many_rows_animated(i => !(i < limit));
        });

        const limit = value_of(query.limit.expr);
        result_table.rows = result_table.rows.filter((_,i) => i < limit);
    }


    result_table.fields = result_table.fields.map(field => ({
        ...field,
        database: null,
        table: null,
        field: null,
    }));


    if (in_debug_mode) {
        console.groupEnd();
        console.timeEnd(timer_name);
    }

    if (_cached_queries[query.cache_id] == null) {
        _cached_queries[query.cache_id] = result_table;
    }

    debug_close_step(_step_run_query, null, result_table);
    return result_table;
}

function run_select_query(query, _step_run_query) {
    let source_table = new Table;
    source_table.add_row([]);


    const _step_select_query = debug_open_step(_step_run_query, 'select query', query, source_table);

    // COMPOUND
    if (query.type == 'compound') {
        const _step_compound = debug_open_step(_step_select_query, 'compound', query, source_table);

        const table = union_tables(
            run_select_query(query.compound.left_query, _step_compound),
            run_select_query(query.compound.right_query, _step_compound),
            !!query.compound.all,
            query.compound.type,
            _step_select_query,
        );

        debug_close_step(_step_compound, null, table, () => {
            insert_many_rows_animated(i => i >= source_table.rows.length);
        });

        return table;
    }


    // FROM
    if (query.from) {
        const _step_from = debug_open_step(_step_select_query, 'from', query.from);

        for (const table_selector of query.from) {
            source_table = join_tables(source_table, value_of_table(table_selector, _step_from), false, false, null, _step_from);

            // _step_table_selector.onstep = () => {
                // set_table(_step_table_selector);
            // };
        }

        debug_close_step(_step_from, null, source_table);
    }


    // WHERE
    if (query.where) {
        const _step_where = debug_open_step(_step_select_query, 'where', query.where, source_table, () => {
            delete_many_rows_animated(x => !where_values[x]);
        });

        const where_values = source_table.rows.map(row => value_of(query.where.expr, source_table.fields, row, null, _step_where));

        source_table.rows = source_table.rows.filter((row,i) => where_values[i]);

        debug_close_step(_step_where, null, null);
    }


    const use_aggregate_selectors = !!query.group_by || !!query.select.selectors.find(({field}) => value_includes_aggregate_function(field));

    let groups;

    // GROUP BY
    if (query.group_by) {
        const _step_group_by = debug_open_step(_step_select_query, 'group_by', query.group_by, source_table, () => {
            darken_many_rows_animated(row => true);
        });


        groups = [];
        let groups_values = [];

        source_table.rows.forEach((row,i) => {
            const _step_group_row = debug_open_step(_step_group_by, 'add row to group', query.group_by, null);

            const row_group_values = query.group_by.map(grouping_term => {
                return value_of(grouping_term.expr, source_table.fields, row, null, _step_group_row);
            });

            let row_group;
            let is_new_group;
            let group_index = groups_values.findIndex(values => Array.equals(values, row_group_values));

            if (group_index >= 0) {
                is_new_group = false;
                row_group = groups[group_index];
            }
            else {
                group_index = groups.length;

                is_new_group = true;
                groups.push(row_group = []);
                groups_values.push(row_group_values);
            }

            row_group.push(row);

            const new_index = groups.flat().indexOf(row);

            debug_single_step(_step_group_row, 'add row to group', query.group_by, null, () => {
                if (is_new_group) {
                    row_group._debug_outline = add_outline_around_animated();
                }

                // for every i, the row is shifted down by 1
                // => shifted down by i => add i to index (=i) => i+i
                // const row_i = i+i;
                const row_i = i;

                row_group._debug_outline.add_row(row_i);

                move_row_animated(row_i, new_index);
            });

            debug_close_step(_step_group_row);
        });

        debug_close_step(_step_group_by);


        // HAVING
        if (query.having) {
            const groups_copy = deep_copy(groups);
            groups_copy.forEach((group,i) => group.group_index = i);
            const groups_flat = groups_copy.flat();

            const _step_having = debug_open_step(_step_select_query, 'having', query.having, null, () => {
                delete_many_rows_animated(i => {
                    const group_index = groups_copy.findIndex(rows => rows.includes(groups_flat[i]));
                    return !groups_copy.find(group => group.group_index == group_index);
                });
            });

            groups = groups.filter(rows => value_of(query.having.expr, source_table.fields, rows[0], rows, _step_having));

            debug_close_step(_step_having);
        }

        groups.forEach((group,i) => group[0]._is_first = true);
        const first_indices = groups.flat().filter((group,i) => {
            group._i = i;
            return group._is_first;
        }).map(group => group._i);

        if (use_aggregate_selectors) {
            debug_single_step(_step_select_query, 'reduce groups', query.group_by, source_table, () => {
                delete_many_rows_animated(i => !first_indices.includes(i));
            });
        }

        source_table.rows = groups.map(rows => rows[0]);
    }
    else {
        groups = [source_table.rows];
    }


    if (in_debug_mode) console.log('%csource_table', 'color:#ff5', source_table);


    // SELECT
    const result_table = new Table;
    const _step_select = debug_open_step(_step_select_query, 'select', query.select, result_table);

    if (in_debug_mode) {
        console.log('use_aggregate_selectors', use_aggregate_selectors);
        console.log('%cgroups', 'color:#ff5', groups);
    }

    groups.forEach((group,i) => {
        const group_table = new Table;

        const visible_rows = group.slice(0,use_aggregate_selectors ? 1 : Infinity);

        for (const selector of query.select.selectors) {

            const _step_selector = debug_open_step(_step_select, `selector group ${i}`, selector, group_table);

            if (selector.as) {
                debug_single_step(_step_selector, 'add column', selector.field);
                debug_single_step(_step_selector, 'alias', selector.as);
            }

            const selector_expr = selector.field.expr ?? selector.field;

            let highlight_indices = [];

            if (selector_expr.type != 'field') {

                highlight_indices = [group_table.fields.length];

                group_table.add_column(
                    {as:value_of(selector.as ?? null) ?? current_query_text.substring(...selector_expr.range).replace(/\s+/g, ' ')},

                    visible_rows.map(row => value_of(selector_expr, source_table.fields, row, group, _step_selector)),
                );
            }
            else {
                const selected_indices = find_every_field_index(source_table.fields, selector_expr);
                highlight_indices = selected_indices.map(i => i+group_table.fields.length); // Temp

                selected_indices.forEach((index,i) => {

                    const existing_field = source_table.fields[index];

                    group_table.add_column(
                        {
                            ...existing_field,
                            as: value_of(selector.as ?? null) ?? value_of(existing_field.as),
                        },

                        visible_rows.map(row => row[index]),
                    );
                });
            }

            debug_close_step(_step_selector, null, group_table, () => {
                highlight_many_columns_animated(i => highlight_indices.includes(i));
            });
        }

        if (in_debug_mode) console.log(`%cgroup_table ${i}`, 'color:#ff5', group_table);

        if (result_table.fields.length == 0) {
            result_table.fields = group_table.fields;
        }

        for (const row of group_table.rows) {
            result_table.add_row(row);
        }
    });

    debug_close_step(_step_select, null, result_table);


    // DISTINCT
    if (query.select.distinct) {
        const all_rows = result_table.rows;
        const distinct_rows = remove_duplicate_rows(all_rows);

        debug_single_open_step(_step_select, 'distinct', query.select.distinct, result_table, () => {
            delete_many_rows_animated(i => !distinct_rows.includes(all_rows[i]));
        });

        result_table.rows = distinct_rows;
    }


    if (in_debug_mode) console.log('%c=', 'color:#ff5', result_table);

    debug_close_step(_step_select_query, null, result_table);
    return result_table;
}

function value_includes_aggregate_function(element) {
    if (element == null) {
        SQLError.raise('can not get value of this element');
    }

    if (element.type == 'unary_operation') {
        return value_includes_aggregate_function(element.operand);
    }
    if (element.type == 'binary_operation') {
        return value_includes_aggregate_function(element.left)
            || value_includes_aggregate_function(element.right);
    }
    if (element.type == 'function_call') {
        return element.function.type == 'aggregate_function';
    }

    return false;
}
function value_of(element, fields=null, current_row=null, rows=null, _step_parent=null) {
    return _value_of(element, _step_parent);

    function _value_of(element, _step_parent) {
        if (element === undefined) {
            debugger
        }

        if (typeof element == 'string' || typeof element == 'number' || element == null) {
            return element;
        }
        if (element instanceof Token) {
            return element.value;
        }
        if (element.expr) {
            return _value_of(element.expr, _step_parent);
        }

        if (element.type == 'field') {
            if (fields == null || current_row == null) {
                SQLError.raise('a field value is not valid in this expression');
            }

            debug_single_step(_step_parent, `value of ${element.type}`, element);

            const field_index = find_field_index(fields, element);
            return current_row[field_index] ?? null;
        }

        if (element.type == 'number') {
            const number = _value_of(element.value, _step_parent);

            // if (number_is_column_index) {
            //     if (!Math.between(number, 0,fields.length)) {
            //         SQLError.raise(`column index out of range '${number}'`);
            //     }

            //     return _value_of(fields[number]);
            // }

            return number;
        }
        if (element.type == 'string') {
            return _value_of(element.value, _step_parent);
        }


        if (element.type == 'query') {
            const _step_query = debug_open_step(_step_parent, `value of ${element.type}`, element);
            const selector_table = run_query(element, _step_parent);
            debug_close_step(_step_query, null, selector_table);

            return selector_table.get_only_column()[0] ?? SQLError.raise('expected at least 1 row');
        }
        if (element.type == 'query') {
            SQLError.raise('can not get value of query');
            return null;
        }
        if (element.type == 'unary_operation') {
            const _step_op = debug_open_step(_step_parent, `value of ${element.type}`, element);

            let is_inverted = false;
            let value;
            switch (element.operator_token.value) {
                case 'not': value = 0|!_value_of(element.operand, _step_op); break;

                case 'is not null': is_inverted = true;
                case 'is null': value = 0|(_value_of(element.operand, _step_op) === null != is_inverted); break;
                case 'is not true': is_inverted = true;
                case 'is true': {
                    const v = _value_of(element.operand, _step_op);
                    value = 0|((!!v && v !== null) != is_inverted); break;
                }
                case 'is not false': is_inverted = true;
                case 'is false': {
                    const v = _value_of(element.operand, _step_op);
                    value = 0|((!v && v !== null) != is_inverted); break;
                }

                case '~': value = ~_value_of(element.operand, _step_op); break;
                case '-': value = -_value_of(element.operand, _step_op); break;
                case '+': value = +_value_of(element.operand, _step_op); break;

                case 'exists': value = 0|!run_query(element.operand, _step_op).is_empty(); break;

                default:
                    SQLError.raise(`invalid operator in unary operation: '${element.operator_token.match}'`);
            }

            debug_close_step(_step_op);
            return value;
        }
        if (element.type == 'binary_operation') {
            const _step_op = debug_open_step(_step_parent, `value of ${element.type}`, element);

            let is_inverted = false;
            let value;
            switch (element.operator_token.value) {
                case '+': value = _value_of(element.left, _step_op) + _value_of(element.right, _step_op); break;
                case '-': value = _value_of(element.left, _step_op) - _value_of(element.right, _step_op); break;
                case '*': value = _value_of(element.left, _step_op) * _value_of(element.right, _step_op); break;
                case '/': value = _value_of(element.left, _step_op) / _value_of(element.right, _step_op); break;

                case '>': value = 0|(_value_of(element.left, _step_op) > _value_of(element.right, _step_op)); break;
                case '<': value = 0|(_value_of(element.left, _step_op) < _value_of(element.right, _step_op)); break;
                case '>=': value = 0|(_value_of(element.left, _step_op) >= _value_of(element.right, _step_op)); break;
                case '<=': value = 0|(_value_of(element.left, _step_op) <= _value_of(element.right, _step_op)); break;

                case '=': value = 0|(_value_of(element.left, _step_op) === _value_of(element.right, _step_op)); break;
                case '!=':
                case '<>': value = 0|(_value_of(element.left, _step_op) !== _value_of(element.right, _step_op)); break;

                case '|': value = _value_of(element.left, _step_op) | _value_of(element.right, _step_op); break;
                case '&': value = _value_of(element.left, _step_op) & _value_of(element.right, _step_op); break;
                case '^': value = _value_of(element.left, _step_op) ^ _value_of(element.right, _step_op); break;

                case '%': value = Math.mod(_value_of(element.left, _step_op), _value_of(element.right, _step_op)); break;
                case 'or': value = _value_of(element.left, _step_op) || _value_of(element.right, _step_op); break;
                case 'and': value = _value_of(element.left, _step_op) && _value_of(element.right, _step_op); break;

                case 'not like': is_inverted = true;
                case 'like': {
                    const like_regex = new RegExp(`^${escape_regexp_string(_value_of(element.right, _step_op)).replace(/_/g, '.').replace(/%/g, '.*')}$`, 'i');
                    value = 0|(like_regex.test(_value_of(element.left, _step_op)) != is_inverted); break;
                }

                default:
                    SQLError.raise(`invalid operator in binary operation: '${element.operator_token.match}'`);
            }

            debug_close_step(_step_op);
            return value;
        }
        if (element.type == 'function_call') {
            const _step_call = debug_open_step(_step_parent, 'function call', element);

            function assert_number_of_arguments(...possible_number_of_arguments) {
                if (!possible_number_of_arguments.includes(element.function_arguments.length)) {
                    SQLError.raise(`invalid number of arguments passed to function '${element.function.field ?? element.function.value}'`);
                }

                return element.function_arguments;
            }
            function get_argument(index) {
                return element.function_arguments[index]?.argument.expr;
            }
            function get_argument_value(index) {
                const arg = get_argument(index);
                return arg ? _value_of(arg, _step_call) : null;
            }

            let value;
            switch (element.function.field?.toLowerCase()) {
                case 'random':
                    assert_number_of_arguments(0);
                    value = Math.random(); break;
                case 'abs':
                    assert_number_of_arguments(1);
                    value = Math.abs(get_argument_value(0)); break;
                case 'ceil':
                    assert_number_of_arguments(1);
                    value = Math.ceil(get_argument_value(0)); break;
                case 'floor':
                    assert_number_of_arguments(1);
                    value = Math.floor(get_argument_value(0)); break;
                case 'pow':
                    assert_number_of_arguments(2);
                    value = Math.pow(get_argument_value(0), get_argument_value(1)); break;
                case 'sqrt':
                    assert_number_of_arguments(1);
                    value = Math.sqrt(get_argument_value(0)); break;

                case 'lower':
                    assert_number_of_arguments(1);
                    value = get_argument_value(0).toString().toLowerCase(); break;
                case 'upper':
                    assert_number_of_arguments(1);
                    value = get_argument_value(0).toString().toUpperCase(); break;
                case 'trim':
                    assert_number_of_arguments(1);
                    value = get_argument_value(0).toString().trim(); break;
                case 'length':
                    assert_number_of_arguments(1);
                    value = get_argument_value(0).toString().length; break;
            }

            if (value !== undefined) {
                debug_close_step(_step_call);
                return value;
            }

            if (element.function.type == 'aggregate_function') {
                const _step_call = debug_open_step(_step_parent, 'aggregate function call', element);

                if (rows == null) {
                    SQLError.raise('aggregate functions are not valid in this expression');
                }

                assert_number_of_arguments(1,2);

                if (get_argument(0).type != 'field') {
                    SQLError.raise(`expected field as argument of aggregate function '${element.function.value}'`);
                }

                const selected_column_indices = find_every_field_index(fields, get_argument(0));
                let column = rows.map(row => row.filter((_,i) => selected_column_indices.includes(i)));
                if (in_debug_mode) console.log('aggregate_function column', column);

                if (element.function_arguments[0].distinct) {
                    column = remove_duplicate_rows(column);
                }

                let value;
                switch (element.function.value) {
                    case 'count':
                        assert_number_of_arguments(1);
                        value = column.length; break;
                }

                if (value !== undefined) {
                    debug_close_step(_step_call);
                    return value;
                }

                const column_values = column.map(row => get_only_value(
                    row,
                    `expected selected 1 field as argument of aggregate function '${element.function.value}'`,
                    `expected at most 1 field as argument of aggregate function '${element.function.value}'`,
                ));
                const column_values_non_null = column_values.filter(value => value != null);

                switch (element.function.value) {
                    case 'avg':
                        assert_number_of_arguments(1);
                        value = Math.avg(...column_values_non_null); break;
                    case 'sum':
                        assert_number_of_arguments(1);
                        value = Math.sum(...column_values_non_null); break;
                    case 'min':
                        assert_number_of_arguments(1);
                        value = Math.min(...column_values_non_null); break;
                    case 'max':
                        assert_number_of_arguments(1);
                        value = Math.max(...column_values_non_null); break;
                    case 'list':
                        assert_number_of_arguments(1,2);
                        value = column_values
                            .map(value => `${value}`)
                            .join(get_argument_value(1) ?? ','); break;
                }

                if (value !== undefined) {
                    debug_close_step(_step_call);
                    return value;
                }
            }

            SQLError.raise(`invalid function name '${element.function.field.toLowerCase()}'`);
        }

        if (element.type == 'value_list') {
            return element.values;
        }
        if (element.type == 'value_in') {
            const _step_value_in = debug_open_step(_step_parent, 'value in', element);

            const left_value = _value_of(element.left, _step_value_in);

            let value_found;

            if (element.right.type == 'query') {
                const column = run_query(element.right, _step_parent).get_only_column();
                value_found = !!column.find(value => value == left_value);
            }
            else {
                value_found = !!_value_of(element.right, _step_value_in).find(value => _value_of(value, _step_value_in) == left_value);
            }

            const is_inverted = false;
            debug_close_step(_step_value_in);
            return 0|(value_found != is_inverted);
        }
        if (element.type == 'value_between') {
            const _step_value_between = debug_open_step(_step_parent, 'value between', element);

            const left_value = _value_of(element.left, _step_value_between);
            const min_value = _value_of(element.min, _step_value_between);
            const max_value = _value_of(element.max, _step_value_between);

            debug_close_step(_step_value_between);
            return 0|(Math.min(min_value,max_value) <= left_value && left_value <= Math.max(min_value,max_value));
        }
        // Temp
        if (element.type == 'any_or_every_value') {
            const _step_any_or_every_value = debug_open_step(_step_parent, 'value between', element);

            const left_value = _value_of(element.left);

            let value;
            if (element.right.type == 'query') {
                const right_table = run_query(element.right, _step_any_or_every_value);
                const result_column = right_table.get_only_column();

                if (element.all) {
                    value = 0|result_column.every(value => value === left_value);
                }
                else {
                    value = 0|result_column.some(value => value === left_value);
                }

                debug_close_step(_step_any_or_every_value, null, right_table);
                return value;
            }
            else if (element.right.type == 'value_list') {
                const values = _value_of(element.right);

                if (element.all) {
                    value = 0|values.every(value => _value_of(value) === left_value);
                }
                else {
                    value = 0|values.some(value => _value_of(value) === left_value);
                }

                debug_close_step(_step_any_or_every_value);
                return value;
            }
            else {
                debugger;
            }
        }
        //

        debugger;
        SQLError.raise(`unknown element type: '${element.type}'`);
    }
}

function get_only_value(list, no_value_error_message, too_many_values_error_message) {
    if (list.length < 1) {
        SQLError.raise(no_value_error_message);
    }
    if (list.length > 1) {
        SQLError.raise(too_many_values_error_message);
    }

    return list[0];
}
function cached_table(database_name, table_name) {
    const database = get_only_value(
        Object.entries(database_cache)
            .filter(([name,db]) => strings_equal_ignore_case(name, database_name))
            .map(([name,db]) => db),
        `can not find database '${database_name}'`,
        `ambiguous database '${database_name}'`,
    );

    return get_only_value(
        Object.entries(database)
            .filter(([name,table]) => strings_equal_ignore_case(name, table_name))
            .map(([name,table]) => table),
        `can not find table '${table_name}' in database '${database_name}'`,
        `ambiguous table '${table_name}' in database '${database_name}'`,
    );
}
function select_table(table_reference) {
    return cached_table(
        table_reference.database ?? current_database,
        table_reference.table,
    );
}

function value_of_table(table_element, _step_parent=null) {
    if (in_debug_mode) console.log('value_of_table', table_element);

    if (table_element == null) {
        SQLError.raise('can not get value of this table_element');
    }


    if (table_element.type == 'table_selector') {
        const _step_table_selector = debug_open_step(_step_parent, 'table selector', table_element);

        let table = value_of_table(table_element.table, _step_table_selector);

        if (value_of(table_element.as) != null) {
            debug_single_step(_step_parent, 'table alias', table_element.as);

            table = Table.from_object(table);

            table.fields = table.fields.map(field => ({
                ...field,
                database: null,
                table: value_of(table_element.as, _step_table_selector),
                field: value_of(field.as, _step_table_selector),
            }));
        }

        debug_close_step(_step_table_selector, null, table);
        return table;
    }


    if (table_element.type == 'table') {

        const table = select_table(table_element);

        if (in_debug_mode) console.log('table', table);

        debug_single_step(_step_parent, 'get table', table_element, table);
        return table;
    }
    else if (table_element.type == 'query') {
        const _step_subquery = debug_open_step(_step_parent, 'subquery', table_element);

        const table = run_query(table_element, _step_subquery);

        debug_close_step(_step_subquery, null, table);
        return table;
    }
    else if (table_element.type == 'join_tables') {
        const _step_join_tables = debug_open_step(_step_parent, 'join tables', table_element, /*TODO ANIM*/);

        let include_left_table, include_right_table;

        switch (table_element.join_operator.value) {
            case 'inner join':
            case 'join':
                include_left_table = false; include_right_table = false; break;

            case 'left outer join':
            case 'left join':
                include_left_table = true; include_right_table = false; break;

            case 'right outer join':
            case 'right join':
                include_left_table = false; include_right_table = true; break;

            case 'full outer join':
            case 'full join':
                include_left_table = true; include_right_table = true; break;

            default:
                SQLError.raise('invalid join type');
        }

        let left_table = value_of_table(table_element.left_table, _step_join_tables);

        left_table = join_tables(
            left_table,
            value_of_table(table_element.right_table, _step_join_tables),
            include_left_table, include_right_table,
            table_element.join_constraint,
            _step_join_tables,
        );

        debug_close_step(_step_join_tables, null, left_table);
        return left_table;
    }

    SQLError.raise('can not get value of this table_element');
}
function join_tables(table_a, table_b, left_table=false, right_table=false, join_constraint=null, _step_parent=null) {
    if (!(table_a instanceof Table) || !(table_b instanceof Table)) {
        SQLError.raise('invalid table passed to join_tables');
    }

    const joined_table = new Table;

    for (const field of table_a.fields) {
        joined_table.add_field(field);
    }
    for (const field of table_b.fields) {
        joined_table.add_field(field);
    }

    for (const row_a of table_a.rows) {
        row_a.any_matched = false;
    }
    for (const row_b of table_b.rows) {
        row_b.any_matched = false;
    }

    for (const row_a of table_a.rows)
    for (const row_b of table_b.rows) {
        const new_row = [...row_a, ...row_b];

        if (join_constraint==null || value_of(join_constraint.expr, joined_table.fields, new_row, null, _step_parent)) {
            row_a.any_matched = true;
            row_b.any_matched = true;

            joined_table.add_row(new_row);
        }
    }

    if (left_table) {
        for (const row_a of table_a.rows) {
            if (row_a.any_matched) continue;
            joined_table.add_row([...row_a, ...table_b.fields.map(() => null)]);
        }
    }
    if (right_table) {
        for (const row_b of table_b.rows) {
            if (row_b.any_matched) continue;
            joined_table.add_row([...table_a.fields.map(() => null), ...row_b]);
        }
    }

    if (in_debug_mode) {
        console.log('%cjoin', 'color:#f24', table_a, table_b);
        console.log('%con', 'color:#f24', join_constraint);
        console.log('%c=', 'color:#f24', joined_table);
    }
    return joined_table;
}


function remove_duplicate_rows(rows) {
    return rows.filter((row,row_index) =>
        !rows.slice(0,row_index).find(previous_row => Array.equals(previous_row, row))
    );
}

function union_tables(table_a, table_b, keep_all, union_type, _step_parent=null) {
    if (table_a.fields.length != table_b.fields.length) {
        SQLError.raise('expected two tables with the same number of fields');
    }

    const result_table = new Table;
    result_table.fields = table_a.fields.copy();
    result_table.rows = table_a.rows.copy();

    switch (union_type) {
        case 'union':
            result_table.rows.push(...table_b.rows);
            break;
        case 'except':
            result_table.rows = result_table.rows.filter(row_a => !table_b.rows.find(row_b => Array.equals(row_a, row_b)));
            break;
        case 'intersect':
            result_table.rows = result_table.rows.filter(row_a => table_b.rows.find(row_b => Array.equals(row_a, row_b)));
            break;
    }

    if (!keep_all) {
        result_table.rows = remove_duplicate_rows(result_table.rows);
    }

    if (in_debug_mode) {
        console.log('%cunion', 'color:#3bf', table_a, table_b);
        console.log('%c=', 'color:#3bf', result_table);
    }
    return result_table;
}
