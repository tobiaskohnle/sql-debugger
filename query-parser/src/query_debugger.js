'use strict';

let _debug_record_steps = true;

function debug_wait_for_step() {
    if (in_debug_mode) console.log('waiting for input...');

    return new Promise((resolve,reject) => {
        onkeydown = function(event) {
            if (event.ctrlKey || event.key.startsWith('F')) {
                return;
            }
            if (event.key == 'Escape') {
                debug_cancel();
            }

            if (event.key == 'PageUp') {
                editor_animate_debug_step_out_of();
                resolve(false);
            }
            if (event.key == 'PageDown') {
                editor_animate_debug_step_in_to();
                resolve(true);
            }

            event.preventDefault();
        };
    });
}

function debug_highlight_range(range, can_step_info=true, is_closing_step=false) {
    update_input({range, class:`current_line ${can_step_info ? 'can_step_into' : ''} ${is_closing_step ? 'is_closing_step' : ''}`});
}

async function debug_highlight_and_pause(range, can_step_into, is_closing_step) {
    debug_highlight_range(range, can_step_into, is_closing_step);
    return await debug_wait_for_step();
}

let _debug_steps = [];
let _debug_current_step;

function debug_reset_steps() {
    _debug_steps = [];
}


function debug_single_open_step(parent_step, name, element=null, old_table=null,on_step=null,on_unskipped_step=null) {
    const step = debug_single_step(parent_step, name, element, old_table,on_step,on_unskipped_step);
    if (!step) return;
    step.is_open_step = true;

    return step;
}
function debug_single_step(parent_step, name, element=null, old_table=null,on_step=null,on_unskipped_step=null) {
    const step = debug_open_step(parent_step, name, element, old_table,on_step,on_unskipped_step);
    if (!step) return;
    step.inner_steps = null;
    step.is_open_step = false;

    return step;
}
function debug_close_step(opening_step, element=null, new_table=null,on_step=null,on_unskipped_step=null) {
    if (new_table != null && !(new_table instanceof Table)) debugger;
    if (on_step != null && !(typeof on_step == 'function')) debugger;
    if (on_unskipped_step != null && !(typeof on_unskipped_step == 'function')) debugger;
    if (!(is_object(opening_step))) debugger;
    if (opening_step === undefined) debugger;

    opening_step.closing_step = {
        element: element ?? opening_step.element,
        range: element?.range ?? opening_step.range,

        new_table: deep_copy(new_table),
        on_step,
        on_unskipped_step,
    };
}
function debug_open_step(parent_step, name, element=null, old_table=null,on_step=null,on_unskipped_step=null) {
    if (!_debug_record_steps) return;

    if (parent_step === undefined) debugger;
    if (!element.range) debugger;
    if (old_table != null && !(old_table instanceof Table)) debugger;
    if (on_step != null && !(typeof on_step == 'function')) debugger;
    if (on_unskipped_step != null && !(typeof on_unskipped_step == 'function')) debugger;
    if (parent_step != null && !(is_object(parent_step))) debugger;

    const step = {
        is_open_step: true,

        name,
        element,
        range: element.range,

        old_table: deep_copy(old_table),
        on_step,
        on_unskipped_step,

        inner_steps: [],
        closing_step: null,
    };

    if (parent_step) {
        parent_step.inner_steps.push(step);
    }
    else {
        _debug_steps.push(step);
    }
    return step;
}

function debug_cancel() {
    input.style.caretColor = '';
    onkeydown = function(event) {
        if (event.key == 'PageDown' || event.key == 'PageUp') {
            event.preventDefault();
        }
    };
    update_debug_text('');
}

function update_debug_text(text) {
    document.querySelector('.debug-text').innerText = text;
}

async function debug_start() {
    input.style.caretColor = '#0000';

    if (in_debug_mode) {
        console.groupCollapsed('%cdebug_start', 'color:#4d4');
    }

    async function step_through(steps, allow_break) {
        if (in_debug_mode) {
            if (steps.length == 0) return;
            (allow_break ? console.group : console.groupCollapsed)(`%cstep_through, ${allow_break ? 'allow break' : 'no break'}`, 'color:#4d4');
        }

        let step_out = false;

        for (const step of steps) {
            if (in_debug_mode) console.log(`%cstep '${step.name}'`, 'color:#4d4', step);
            _debug_current_step = step;
            update_debug_text(step.name);

            const STEP_IN_TO = 'STEP IN TO';
            const STEP_OVER = 'STEP OVER';
            const STEP_OUT_OF = 'STEP OUT OF';
            let next_action;

            const can_step_in_to = !!step.inner_steps?.length || step.is_open_step;
            if (in_debug_mode) console.log('can_step_in_to', can_step_in_to);

            if (!allow_break) {
                next_action = STEP_OVER;
            }
            else if (can_step_in_to) {
                if (await debug_highlight_and_pause(step.range, true)) {
                    next_action = STEP_IN_TO;
                }
                else {
                    next_action = STEP_OVER;
                }
            }
            else {
                if (await debug_highlight_and_pause(step.range, false)) {
                    next_action = null; // CONTINUE LIKE NORMAL (LIKE STEP_OVER)
                }
                else {
                    next_action = STEP_OUT_OF;
                }
            }

            if (in_debug_mode) console.log('allow_break', allow_break, 'next_action', next_action);
            // debugger

            if (step.old_table) display_table(step.old_table);
            step.on_step?.();
            if (allow_break) step.on_unskipped_step?.();

            if (can_step_in_to) {
                if (step.inner_steps?.length) {
                    switch (next_action) {
                        case STEP_IN_TO:
                            await step_through(step.inner_steps, true);
                            break;
                        case STEP_OVER:
                            await step_through(step.inner_steps, false);
                            break;
                        case STEP_OUT_OF:
                            await step_through(step.inner_steps, false);
                            allow_break = false;
                            break;
                        default:
                            debugger;
                    }
                }

                if (step.closing_step) {
                    if (step.closing_step.new_table) display_table(step.closing_step.new_table);
                    step.closing_step.on_step?.();
                    if (allow_break) step.closing_step.on_unskipped_step?.();
                }

                if (!allow_break) {
                    continue;
                }
                else if (await debug_highlight_and_pause(step.closing_step?.range ?? step.range, true, true)) {
                    continue;
                }
                else {
                    allow_break = false;
                }
            }
            else {
                switch (next_action) {
                    case STEP_OUT_OF:
                        allow_break = false;
                        break;
                }
            }
        }

        if (in_debug_mode) console.groupEnd();
    }

    display_table(new Table);

    await step_through(_debug_steps, true);

    update_input();

    if (in_debug_mode) {
        console.log('%cdone', 'color:#4d4');
        console.groupEnd();
    }

    debug_cancel();
}
