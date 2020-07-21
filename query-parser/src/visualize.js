'use strict';

function visualize() {

}

let prev_random_hue_a = 0;
let prev_random_hue_b = 180;

function mod_distance(a,b, mod_n) {
    const distance = Math.abs(a-b);
    return Math.min(distance, mod_n-distance);
}

function get_random_hue() {
    let hue;

    do {
        hue = Math.random()*360;
    }
    while (mod_distance(prev_random_hue_a,hue,360) < 30 || mod_distance(prev_random_hue_b,hue,360) < 30);

    [prev_random_hue_a,prev_random_hue_b] = [prev_random_hue_b,hue];
    return hue;
}

const result_element = document.querySelector(`.result`);

function row_element(row_index) {
    return result_element.querySelector(`tr:nth-child(${row_index+2})`);
}
function column_elements(column) {
    return Array.from(result_element.querySelectorAll(`td:nth-child(${column+1}), th:nth-child(${column+1})`));
}
function number_of_rows() {
    return Array.from(result.querySelectorAll('tr:nth-child(n+2)')).length;
}
function rows_that_match(row_predicate) {
    return Array(number_of_rows()).fill().map((_,i) => i).filter(i => row_predicate(i));
}

function delete_many_rows_animated(row_predicate, delay_by_index_in_groups=null) {
    const deleted_row_indices = rows_that_match(row_predicate);
    const deleted_rows_height = Math.sum(...deleted_row_indices.map(i => row_element(i).clientHeight));

    for (let i = 0; i < deleted_row_indices.length; i++) {
        // subtract i => number of previously deleted rows
        const delete_index = deleted_row_indices[i]-i;
        const deleted_row = row_element(delete_index);

        if (i < 50) {
            const delay = delay_by_index_in_groups
                ? Math.max(0,delay_by_index_in_groups.findIndex(group => group.includes(deleted_row)))*100
                : i*30;
            delete_row_animated(delete_index, delay, deleted_rows_height);
        }
        else {
            deleted_row.parentElement.removeChild(deleted_row);
        }
    }
}
function delete_row_animated(row_index, delay, all_deleted_rows_height=0) {
    const deleted_row = row_element(row_index);
    const deleted_row_height = deleted_row.clientHeight;
    const deleted_row_top = deleted_row.offsetTop;

    deleted_row.getAnimations().forEach(anim => anim.cancel());

    const duration = 2500;
    const duration_after_deletion = 700;
    const easing = 'ease-in-out';

    const parent = deleted_row.parentElement;

    const next_rows = Array.from(parent.querySelectorAll(`tr:nth-child(n+${row_index+2+1})`));

    deleted_row.is_deleted = true;

    parent.removeChild(deleted_row);
    parent.appendChild(deleted_row);

    const deleted_row_new_top = deleted_row.offsetTop;
    const deleted_row_offset = deleted_row_top - deleted_row_new_top + all_deleted_rows_height - deleted_row_height;

    deleted_row.animate([
        {transform: `translate(0,${deleted_row_offset}px)`, background:'#f11'},
        {transform: `translate(0,${deleted_row_offset}px)`, background:'#f11'},
    ], {
        composite: 'replace',
        easing: 'ease-out',
        duration: delay,
    }).onfinish = () =>
    deleted_row.animate([
        {transform: `translate( 0px,${deleted_row_offset}px)`, background:'#f11'},
        {transform: `translate(90px,${deleted_row_offset}px)`, opacity:0, background:'#f11', offset:1},
        {transform: `translate( 0px,${deleted_row_offset}px)`, opacity:0, background:'#f11', offset:1},
    ], {
        composite: 'replace',
        easing: 'ease-out',
        duration,
    }).onfinish = () => {
        try {
            parent.removeChild(deleted_row);
        }
        catch {} // Temp
    };

    next_rows.forEach((next_row,i) => {
        const min_delay = duration_after_deletion * 1.55;
        const move_up_delay = duration_after_deletion/15 * i + min_delay;

        if (!next_row.is_deleted) {
            next_row.animate([
                {transform: `translate(0,${deleted_row_height}px)`},
                {transform: `translate(0,${deleted_row_height}px)`},
            ], {
                composite: 'accumulate',
                duration: delay+move_up_delay,
            }).onfinish = () => {
                if (!next_row.is_deleted) {
                    next_row.animate([
                        {transform: `translate(0,${deleted_row_height}px)`},
                        {},
                    ], {
                        composite: 'accumulate',
                        easing: 'ease-in-out',
                        duration: duration_after_deletion,
                    });
                }
            }
        }
    });
}

function darken_many_rows_animated(row_predicate) {
    const darkened_rows = rows_that_match(row_predicate);

    for (let i = 0; i < darkened_rows.length; i++) {
        darken_row_animated(darkened_rows[i], i*30);
    }
}
function darken_row_animated(row_index, delay=0) {
    const darkened_row = row_element(row_index);
    if (!darkened_row) return false;

    const easing = 'linear';

    const anim = darkened_row.animate([
        {},
        {background:`linear-gradient(to left, #100, #1000)`, color:'#fff', offset:.1},
        {background:`linear-gradient(to left, #100, #1000)`, color:'#fff3'},
    ], {
        fill: 'forwards',
        composite: 'replace',
        easing,
        delay,
        duration: 250,
    });

    return {
        release() {
            anim.cancel();
        },
    };
}

function highlight_many_rows_animated(row_predicate, color,faded_color) {
    const highlighted_rows = rows_that_match(row_predicate);

    for (let i = 0; i < highlighted_rows.length; i++) {
        highlight_row_animated(highlighted_rows[i], color,faded_color, i*30);
    }
}
function highlight_many_columns_animated(column_predicate, color,faded_color) {
    const number_of_columns = Array.from(result.querySelector('tr').querySelectorAll('th,td')).length;
    const highlighted_columns = Array(number_of_columns).fill().map((_,i) => i).filter(i => column_predicate(i));

    for (let i = 0; i < highlighted_columns.length; i++) {
        highlight_column_animated(highlighted_columns[i], color,faded_color, i*30);
    }
}

function highlight_row_animated(row_index, color='#4aa7', faded_color='#0550', delay=0, stay_highlighted=false) {
    const highlighted_row = typeof row_index=='number' ? row_element(row_index) : row_index;
    if (!highlighted_row) return false;

    const easing = 'linear';
    const duration = 1000;

    highlighted_row.animate([
        {},
        {background:color, offset:.1},
        {background:faded_color},
    ], {
        fill: stay_highlighted ? 'forwards' : 'none',
        composite: 'replace',
        easing,
        delay,
        duration,
    });
}
function highlight_column_animated(column_index, color='#4aa7', faded_color='#0550', delay=0) {
    const highlighted_items = column_elements(column_index);
    if (!highlighted_items.length) return false;

    const easing = 'linear';
    const duration = 1000;

    highlighted_items.forEach(item =>
        item.animate([
            {},
            {background:color, offset:.1},
            {background:faded_color},
        ], {
            composite: 'accumulate',
            easing,
            delay,
            duration,
        })
    );
}

function insert_many_rows_animated(row_predicate) {
    const inserted_rows = rows_that_match(row_predicate);

    inserted_rows.forEach((index,i) => {
        insert_row_animated(index, i*30);
    });
}
// does not actually insert a row,
// just does the animation
function insert_row_animated(row_index, delay) {
    const row = row_element(row_index);

    const easing = 'ease-out';
    const duration = 1000;

    row.animate([
        {opacity:0},
        {opacity:0},
    ], {
        duration: delay,
    }).onfinish = () =>
    row.animate([
        {transform: `translate(90px,0)`, opacity:0},
        {},
    ], {
        easing,
        duration,
    });
}

function add_outline_around_animated(color, faded_color) {
    const hue = get_random_hue();
    color = color ?? `hsla(${hue},90%,55%,.8)`;
    faded_color = faded_color ?? `hsla(${hue},70%,15%,.33)`;

    const outline_element = document.createElement('div');
    result.appendChild(outline_element);

    let all_rows = [];

    outline_element.style.position = 'absolute';
    outline_element.style.border = '4px solid';
    outline_element.style.borderColor = color;

    update_outline();
    const interval_id = setInterval(update_outline, 1000/30);

    function update_outline() {
        all_rows = all_rows.filter(row => row.parentElement == result);

        const top = Math.min(...all_rows.map(row => row.offsetTop));
        const bottom = Math.max(...all_rows.map(row => row.offsetTop+row.clientHeight));

        outline_element.style.width = `${result.clientWidth}px`;
        outline_element.style.height = `${bottom-top}px`;

        outline_element.style.top = `${result.offsetTop+top}px`;
        outline_element.style.left = `${result.offsetLeft}px`;
    }

    return {
        add_row(new_row_index) {
            const new_row = row_element(new_row_index);
            if (!new_row) return;

            new_row.getAnimations().forEach(anim => anim.cancel());
            all_rows.push(new_row);

            highlight_row_animated(new_row, color,faded_color, 0, true);
        },
        // group_index(group=all_rows) {
        //     if (group.length == 0) {
        //         return 0;
        //     }
        //     return group.indexOf(group.min_by(row => row.offsetTop));
        // },
        release() {
            clearInterval(interval_id);
            result.removeChild(outline_element);
        },
    };
}

function move_row_animated(row_index, move_to_row_index) {
    if (row_index<0 || move_to_row_index<0) debugger;

    const move_dir = Math.sign(move_to_row_index - row_index);
    const move_number_of_rows = Math.abs(move_to_row_index - row_index);
    if (move_number_of_rows == 0) return;

    const move_indices = Array.from(Array(move_number_of_rows+1), (_,i) => row_index + i*move_dir)
    const moving_elements = move_indices.map(index => row_element(index));
    if (!moving_elements.length) return false;

    const moving_row = moving_elements[0];
    const target_row = moving_elements.last();
    if (moving_row == null) return;
    if (moving_row == target_row) return;

    const moving_row_top = moving_row.offsetTop;
    const moving_row_height = moving_row.clientHeight;
    const target_row_top = target_row.offsetTop;

    const duration = 500;
    const easing = 'ease-in-out';

    const anim = moving_row.animate([
        {transform: `translate(0,${-(target_row_top-moving_row_top)}px)`},
        {},
    ], {
        composite: 'add',
        easing,
        duration,
    });

    moving_elements.slice(1).forEach((element,i) => {
        if (!element) return;
        const move_duration = duration/moving_elements.length;
        const delay = move_duration * i;

        element.animate([
            {transform: `translate(0,${-(moving_row_height * -move_dir)}px)`},
            {transform: `translate(0,${-(moving_row_height * -move_dir)}px)`},
        ],
        {
            composite: 'add',
            easing,
            duration: delay,
        }).onfinish = () =>
        element.animate([
            {transform: `translate(0,${-(moving_row_height * -move_dir)}px)`},
            {},
        ], {
            composite: 'add',
            easing,
            duration: duration-delay,
        });
    });

    // move row
    const parent = moving_row.parentElement;

    parent.removeChild(moving_row);

    if (target_row.nextSibling) {
        if (move_dir > 0) {
            parent.insertBefore(moving_row, target_row.nextSibling);
        }
        else {
            parent.insertBefore(moving_row, target_row);
        }
    }
    else {
        parent.appendChild(moving_row);
    }
    //
}


// editor animations

const line_numbers = document.querySelector('.line-numbers');

function editor_animate_debug_step_out_of() {
    line_numbers.animate([
        {borderColor:'#777'},
        {},
    ], {
        duration: 500,
    });
}
function editor_animate_debug_step_in_to() {
    line_numbers.animate([
        {borderColor:'#171'},
        {},
    ], {
        duration: 500,
    });
}
