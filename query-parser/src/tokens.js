'use strict';

const AGGREGATE_FUNCTIONS = [
    'count',
    'avg',
    'sum',
    'max',
    'min',
    'list',
];

const SYMBOL_OPERATORS = [
    { operator: '~',            precedence: 9, is_binary: false, is_right_associative: true  },

    { operator: '+',            precedence: 7, is_binary: false, is_right_associative: true  },
    { operator: '-',            precedence: 7, is_binary: false, is_right_associative: true  },

    { operator: '*',            precedence: 6, is_binary: true,  is_right_associative: false },
    { operator: '/',            precedence: 6, is_binary: true,  is_right_associative: false },
    { operator: '%',            precedence: 6, is_binary: true,  is_right_associative: false },

    { operator: '+',            precedence: 5, is_binary: true,  is_right_associative: false },
    { operator: '-',            precedence: 5, is_binary: true,  is_right_associative: false },
    { operator: '&',            precedence: 5, is_binary: true,  is_right_associative: false },
    { operator: '^',            precedence: 5, is_binary: true,  is_right_associative: false },
    { operator: '|',            precedence: 5, is_binary: true,  is_right_associative: false },

    { operator: '=',            precedence: 3, is_binary: true,  is_right_associative: false },
    { operator: '<>',           precedence: 3, is_binary: true,  is_right_associative: false },
    { operator: '!=',           precedence: 3, is_binary: true,  is_right_associative: false },
    { operator: '<',            precedence: 3, is_binary: true,  is_right_associative: false },
    { operator: '>',            precedence: 3, is_binary: true,  is_right_associative: false },
    { operator: '<=',           precedence: 3, is_binary: true,  is_right_associative: false },
    { operator: '>=',           precedence: 3, is_binary: true,  is_right_associative: false },
];

const KEYWORD_OPERATORS = [
    { operator: 'is null',      precedence: 8, is_binary: false, is_right_associative: false },
    { operator: 'is not null',  precedence: 8, is_binary: false, is_right_associative: false },

    { operator: 'is false',     precedence: 8, is_binary: false, is_right_associative: false },
    { operator: 'is not false', precedence: 8, is_binary: false, is_right_associative: false },

    { operator: 'is true',      precedence: 8, is_binary: false, is_right_associative: false },
    { operator: 'is not true',  precedence: 8, is_binary: false, is_right_associative: false },

    { operator: 'like',         precedence: 2, is_binary: true,  is_right_associative: false },
    { operator: 'not like',     precedence: 2, is_binary: true,  is_right_associative: false },

    { operator: 'not',          precedence: 1, is_binary: false, is_right_associative: true  },

    { operator: 'and',          precedence: 0, is_binary: true,  is_right_associative: false },

    { operator: 'or',           precedence:-1, is_binary: true,  is_right_associative: false },

    { operator: 'between',      precedence:-2, is_binary: true,  is_right_associative: true  },
    { operator: 'not between',  precedence:-2, is_binary: true,  is_right_associative: true  },

    { operator: 'exists',       precedence:-3, is_binary: false, is_right_associative: true  },
];

const OPERATORS = [
    ...SYMBOL_OPERATORS,
    ...KEYWORD_OPERATORS,
];

const KEYWORDS = [
    'as',
    'asc',
    'desc',
    'distinct',
    'from',
    'full join',
    'outer join',
    'full outer join',
    'group by',
    'having',
    'inner join',
    'on',
    'join',
    'left join',
    'left outer join',
    'limit',
    'order by',
    'right join',
    'right outer join',
    'select',
    'union',
    'except',
    'intersect',
    'where',
    'in',
    'all',
    'any',
    'some',
];

function escape_regexp_string(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function match_any_whitespace(string) {
    return string.replace(/ /g, '\\s+?');
}

const TOKENS = [
    {
        name: 'whitespace',
        matches: /^(\s+|(--|#)(.|\n)*?(\n|$)|\/\*(.|\n)*?\*\/)/,
        ignore: true,
        style: 'color:#555',
    },

    {
        name: 'debug',
        matches: /^\b(debug|load new|load|clear cache|save)\b/i,
        style: 'font-weight:bold; color:#f03; text-transform:uppercase'
    },
    {
        name: 'keyword',
        matches: new RegExp(`^\\b(${KEYWORDS.sort_by(op => -op.length).map(match_any_whitespace).join('|')})\\b`, 'i'),
        style: 'font-weight:bold; color:#49f; text-transform:uppercase',
    },
    {
        name: 'operator',
        matches: new RegExp(`^(${SYMBOL_OPERATORS.map(op => op.operator).sort_by(op => -op.length).map(match_any_whitespace).map(escape_regexp_string).join('|')})`),
        style: 'color:#fa2',
    },
    {
        name: 'operator',
        matches: new RegExp(`^\\b(${KEYWORD_OPERATORS.map(op => op.operator).sort_by(op => -op.length).map(match_any_whitespace).join('|')})\\b`, 'i'),
        style: 'font-weight:bold; color:#49f; text-transform:uppercase',
    },

    {
        name: 'number',
        matches: /^(\d+\.\d*|\d*\.\d+|\d+)/,
        style: 'color:#ff4',
    },
    {
        name: 'string',
        matches: /^('.*?'|".*?")/,
        style: 'color:#5e5',
    },
    {
        name: 'aggregate_function',
        matches: new RegExp(`^\\b(${AGGREGATE_FUNCTIONS.sort_by(op => -op.length).map(match_any_whitespace).join('|')})\\b`, 'i'),
        style: 'font-weight:bold; color:#2aa; text-transform:uppercase',
    },
    {
        name: 'identifier',
        matches: /^([\wäöü]+|\[.*?\])/,
        style: 'color:#eee',
    },

    {
        name: 'comma',
        matches: /^,/,
        style: 'color:#0ff',
    },
    {
        name: 'dot',
        matches: /^\./,
        style: 'color:#4bb',
    },
    {
        name: 'parentheses',
        matches: /^[()]/,
        style: 'color:#4ef',
    },
    {
        name: 'semicolon',
        matches: /^;/,
        style: 'color:#17d',
    },

    {
        name: 'invalid',
        matches: /^./,
        style: 'color:#901; background:#301',
    },
];

function _next_token(query, string_index) {
    for (const token of TOKENS) {
        let match;
        if (match=query.substr(string_index).match(token.matches)) {
            return {token, match:match[0], range:[string_index, string_index + match[0].length]};
        }
    }
}

function* _tokenize(query) {
    let index = 0;
    while (index <= query.length) {
        const next = _next_token(query, index);

        if (!next || !next.match.length) {
            break;
        }

        index += next.match.length;

        yield next;
    }
}

function strings_equal_ignore_case(string_a, string_b) {
    // return string_a.toLowerCase() == string_b.toLowerCase();

    if (string_a.length != string_b.length) {
        return false;
    }

    for (let i = 0; i < string_a.length; i++) {
        const char_distance = string_a.charCodeAt(i)-string_b.charCodeAt(i);

        if (char_distance!=0 && char_distance!=0x20 && char_distance!=-0x20) {
            return false;
        }
    }

    return true;
}

class Token {
    constructor(from) {
        this.type = from.token.name;
        this.match = from.match;
        this.value = from.match.toLowerCase();
        this.range = from.range;

        switch (this.type) {
            case 'keyword':
            case 'operator':
                this.value = this.value.replace(/\s+/g, ' ');
                break;

            case 'number':
                this.value = parseFloat(this.match);
                break;

            case 'identifier':
                if (this.match.startsWith('[') && this.match.endsWith(']')) {
                    this.value = this.match.substring(1, this.match.length-1);
                }
                else {
                    this.value = this.match;
                }
                break;

            case 'string':
                this.value = this.match.substring(1, this.match.length-1);
                break;
        }
    }

    is(token_value=null, token_type=null) {
        return (token_type === null || token_type === this.type)
            && (token_value === null || strings_equal_ignore_case(token_value, this.match));
    }
}
function tokens(query) {
    return Array.from(_tokenize(query))
        .filter(({token}) => !token.ignore)
        .map(token => new Token(token));
}
