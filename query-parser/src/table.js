'use strict';

class Table {
    constructor() {
        this.fields = [];
        this.rows = [];
    }

    add_field(field) {
        const {database=null, table=null, field:_field=null, as=null, field_type='--'} = field;

        // verify`[String|null]..`([database,table,_field]);
        // verify`String|null`(as);
        // verify`'number'|'string'|'--'`(field_type);

        this.fields.push({database, table, field:_field, as, field_type});
    }
    add_row(...rows) {
        // verify`[Number|String|null] ..`(values);

        this.rows.push(...rows);
    }
    add_column(field, column_values) {
        // verify`[Number|String|null] ..`(column_values);

        const existing_row_index = this.fields.findIndex(({as}) => strings_equal_ignore_case(as, field.as));

        if (existing_row_index >= 0) {
            this.rows.forEach((row,i) => row[existing_row_index] = column_values[i]);
            return;
        }

        this.add_field(field);

        if (this.rows.length == 0) {
            this.rows = Array.from(Array(column_values.length), () => []);
        }

        this.rows.forEach((row,i) => row.push(column_values[i]));
    }

    get_column(row_index) {
        return this.rows.map(row => row[row_index]);
    }
    get_only_column() {
        get_only_value(
            this.fields,
            `expected table with at least 1 field`,
            `expected table with only 1 field`,
        );

        return this.get_column(0);
    }

    is_empty() {
        return this.rows.length==0 || this.fields.length==0;
    }

    static from_object(object) {
        return Object.assign(new Table, object);
    }
}

function find_every_field_index(fields, {database=null, table=null, field=null}) {
    // verify`[{}*]..`(fields);
    // verify`[String|null] ..`([database,table,field]);

    const indices = fields
    .map((_field,index) => ({_field,index})).filter(({_field}) => {
        return (database == null || _field.database != null && strings_equal_ignore_case(database, _field.database))
            && (table == null || _field.table != null && strings_equal_ignore_case(table, _field.table))
            && (field == null || _field.field != null && strings_equal_ignore_case(field, _field.field))
            || database == null
            && table == null
            && field != null
            && strings_equal_ignore_case(field, value_of(_field.as));
    }).map(({index}) => index);

    if (indices.length == 0) {
        SQLError.raise(`can not find field '${database}.${table}.${field}'`);
    }

    return indices;
}
function find_field_index(fields, {database=null, table=null, field=null}) {
    return get_only_value(
        find_every_field_index(fields, {database,table,field}),
        `can not find field '${database}.${table}.${field}'`,
        `ambiguous field '${database}.${table}.${field}'`,
    );
}

let database_cache = {};

let current_database = 'musik';

function load_database(name) {
    current_database = name;
}
async function load_new_database() {
    const new_database = {};

    const database_folder = await chooseFileSystemEntries({type:'open-directory'});
    const database_name = database_folder.name;

    for await (const entry of database_folder.getEntries()) {
        if (entry.isFile) {
            const table_file = await entry.getFile();

            const extention_dot_index = table_file.name.lastIndexOf('.');
            const table_name = extention_dot_index==-1 ? table_file.name : table_file.name.substring(0,extention_dot_index);

            const file_reader = new FileReader;
            file_reader.onload = function() {
                const table = table_from_text(database_name, table_name, file_reader.result);
                new_database[table_name] = table;
            };

            file_reader.readAsText(table_file);
        }
    }

    database_cache[database_name] = new_database;
}

function table_from_text(database_name, table_name, text) {
    const lines = text.split(/\n/g).filter(x => x);

    const fields_text = lines[0];
    const rows_texts = lines.slice(1);

    const valid_types = ['number', 'string'];

    const fields = Array.from(fields_text.matchAll(/(\w+):(\w+)/g)).map(match => {
        let [_, name, type] = match;

        if (!valid_types.includes(type)) {
            throw new Error(`invalid type '${type}'`);
        }

        return {
            index: match.index,
            table: table_name,
            field: name,
            field_type: type,
        };
    });

    const rows = rows_texts.map(row_text =>
        fields.map((field,i) => {
            const next_field_index = fields[i+1]?.index ?? Infinity;

            const field_text = row_text.substring(field.index,next_field_index).trim();

            if (field_text == '') {
                return null;
            }

            switch (field.field_type) {
                case 'number': return parseFloat(field_text);
                case 'string': return field_text;
            }
        })
    );

    const table = new Table;

    for (const field of fields) {
        table.add_field({
            database: database_name,
            table: field.table,
            field: field.field,
            as: field.field,
            field_type: field.field_type,
        });
    }
    for (const row of rows) {
        table.add_row(row);
    }

    return table;
}

function tr(td_list) {
    const tr = document.createElement('tr');
    for (const td of td_list) {
        tr.appendChild(td);
    }
    return tr;
}
function td(text) {
    const td = document.createElement('td');

    if (text === null) {
        const span = document.createElement('span');
        span.innerText = 'null';
        span.classList.add('null');

        td.appendChild(span);
    }
    else if (text === "") {
        const span = document.createElement('span');
        span.innerText = '""';
        span.classList.add('null');

        td.appendChild(span);
    }
    else {
        td.innerText = text;
    }

    return td;
}
function th(text) {
    const th = document.createElement('th');
    th.innerText = text;
    return th;
}

function wait_for_scroll_to_bottom(id) {
    return new Promise((resolve,reject) => {
        onwheel = event => {
            if (current_displayed_table_id != id) {
                reject('old version of displayed table');
                return;
            }

            if (scrollY >= document.body.scrollHeight-document.body.clientHeight-200) {
                resolve();
            }
        };
    });
}

let _display_table_id = 0;
let current_displayed_table_id;

async function display_table(table) {
    const table_id = _display_table_id++;
    current_displayed_table_id = table_id;

    onscroll = null;

    result.innerHTML = '';

    if (table.is_empty()) {
        result.style.setProperty('--before_content', `'${table.rows.length} row${table.rows.length==1 ? '' : 's'}'`);
        result.appendChild(tr([td('No result')]));
        return;
    }

    result.appendChild(tr(table.fields.map(({field, as}) => th(as))));

    let row_index = 0;
    for (const row of table.rows) {
        result.appendChild(tr(row.map(value => td(value))));

        if (row_index++ % 50 == 50-1) {
            result.style.setProperty('--before_content', `'${row_index} / ${table.rows.length} row${table.rows.length==1 ? '' : 's'}'`);
            await wait_for_scroll_to_bottom(table_id);
        }
    }

    result.style.setProperty('--before_content', `'${table.rows.length} row${table.rows.length==1 ? '' : 's'}'`);
    return table.rows.length;
}
