'use strict';

const input = document.querySelector('.input');
const editor = document.querySelector('.editor');
const result = document.querySelector('.result');

let current_query;

function temp() {
    let i = 1;
    while (window[`temp${i}`]) i++;
    return window[`temp${i-1}`];
}

ondragstart = function(event) {
    event.preventDefault();
};

onbeforeunload = function(event) {
    const input_value = input.value;
    localStorage.setItem('sql-parser-input-value', input_value);

    localStorage.setItem('sql-parser-cache', JSON.stringify({database_cache,current_database}));
};

onload = function(event) {
    const input_value = localStorage.getItem('sql-parser-input-value');
    input.value = input_value ?? '';
    input.focus();

    const database_cache_string = localStorage.getItem('sql-parser-cache');

    if (database_cache_string) {
        const loaded_cache = JSON.parse(database_cache_string);
        current_database = loaded_cache.current_database;
        database_cache = loaded_cache.database_cache;

        for (const database_name in database_cache) {
            const database = database_cache[database_name];

            for (const table_name in database) {
                database[table_name] = Table.from_object(database[table_name]);
            }
        }
    }

    parse_query_input();
    // run_query_input(); // AUTO RUN
};

function input_on_input(event) {
    parse_query_input();
}
function input_on_keydown(event) {
    if ((event.shiftKey||event.ctrlKey) && event.key == 'Enter') {
        event.preventDefault();
        run_query_input(event.shiftKey && event.ctrlKey);
        return;
    }

    if (event.key == 'Escape') {
        document.execCommand('selectAll');
        document.execCommand('delete');
        parse_query_input();
    }

    if (event.key == 'Tab') {
        event.preventDefault();

        const start = input.selectionStart;
        const end = input.selectionEnd;

        if (start == end) {
            if (event.shiftKey) {
                if (input.value[start-1] == '\t' || input.value[start-1] == ' ') {
                    document.execCommand('delete', false);
                }
            }
            else {
                document.execCommand('insertText', false, '\t');
            }

            parse_query_input();
        }
    }
}

function run_query_input(start_debugging=false) {
    try {
        parse_query_input();

        if (!current_query) {
            SQLError.raise('syntax error');
        }
        else if (current_query.type == 'load new') {
            load_new_database();
        }
        else if (current_query.type == 'load') {
            load_database(current_query.name);
        }
        else if (current_query.type == 'clear cache') {
            database_cache = {};
        }
        else {
            // _debug_record_steps = !!start_debugging;
            display_table(init_and_run_query(current_query));

            if (start_debugging) {
                debug_start();
            }
        }
    }
    catch (error) {
        if (error.name != SQLError.name) {
            throw error;
        }

        display_table(new Table);
        for (let i = 0; i < 100; i++) console.groupEnd(); // Temp

        alert(error.message);
    }
}
function parse_query_input() {
    input.style.height = '185px'; // min height
    input.style.height = `${input.scrollHeight}px`;

    document.querySelector('.line-numbers').innerText =
        Array.from(
            Array(1+input.value.split('').count(chr => chr=='\n')),
            (_,i) => `${i}\n`,
        ).join('').trimEnd();

    try {
        const query_text = input.selectionStart==input.selectionEnd
            ? input.value
            : input.value.substring(input.selectionStart,input.selectionEnd);

        current_query = null;
        current_query = init_stream_and_parse_query_statement(query_text);
        if (in_debug_mode) console.log('parse tree', current_query);
        update_input();
    }
    catch (error) {
        if (error.name != SQLError.name) {
            throw error;
        }

        update_input({
            range: error.error_range,
            class: 'wave',
        });

        if (in_debug_mode) {
            console.error(error);
        }
    }
}

function update_input(highlight={range:[0,0]}) {
    const {range:highlight_range, class:highlight_class} = highlight;
    if (!highlight_range) debugger;

    const input_tokens = Array.from(_tokenize(input.value));

    let previous_text_span;
    const text_spans = [];

    input.value.split('').forEach((text,index) => {
        const token = input_tokens.find(token => Math.between(index, ...token.range));
        const is_highlighted = Math.between(index, ...highlight_range);

        if (token == previous_text_span?.token && is_highlighted == previous_text_span?.is_highlighted) {
            previous_text_span.text += text;
        }
        else {
            text_spans.push(previous_text_span = {text, style:token.token.style, token, is_highlighted});
        }
    });

    if (text_spans.last()?.text.match(/^(\n\s*)?$/)) {
        text_spans.last().text = ` ${text_spans.last().text}`;
    }
    else {
        text_spans.push({style:' ', text:' '});
    }
    const _spans = text_spans.map(text_span => `<span style='${text_span.style}'>${escape_html(text_span.text)}</span>`);

    const highlight_span_index_0 = text_spans.findIndex(({is_highlighted}) => is_highlighted);
    const highlight_span_index_1 = text_spans.find_last_index(({is_highlighted}) => is_highlighted)+1;

    _spans.splice(highlight_span_index_1, 0, `</span>`); // last before first
    _spans.splice(highlight_span_index_0, 0, `<span class='${highlight_class}'>`);

    document.querySelector('.editor .text').innerHTML = _spans.join('');
}

function escape_html(html_string) {
    return html_string.replace(/["&<>]/g, match => ({'"':'&quot;', '&':'&amp;', '<':'&lt;', '>':'&gt;'}[match]));
}
