'use strict';

Math.sum = function(...values) {
    return values.reduce((acc,value) => acc+value, 0);
};
Math.avg = function(...values) {
    return Math.sum(...values) / values.length;
};
Math.round_to = function(value, factor=1) {
    return Math.round(value/factor) * factor;
};
Math.map = function(value, x0,x1, y0,y1) {
    return (y0-y1) / (x0-x1) * (value-x0) + y0;
};
Math.mod = function(x, n) {
    return x - Math.floor(x/n) * n;
};
Math.clamp = function(v, min, max) {
    return Math.max(min, Math.min(max, v));
};
Math.between = function(value, min,max) {
    return min <= value && value < max;
};
Array.prototype.find_last = function(callback) {
    return this[this.find_last_index(callback)];
};
Array.prototype.copy = function() {
    return this.slice();
};
Array.prototype.count = function(predicate) {
    return this.reduce((acc,item,index,source_array) => acc + !!predicate(item,index,source_array), 0);
};
Array.prototype.sort_by = function(predicate) {
    return this.copy().sort((a, b) => predicate(a) - predicate(b));
};
Array.prototype.extreme_by = function(fn, predicate) {
    const mapped = this.map(predicate);
    return this[mapped.indexOf(fn.apply(null, mapped))];
};
Array.prototype.min_by = function(predicate) {
    return this.extreme_by(Math.min, predicate);
};
Array.prototype.max_by = function(predicate) {
    return this.extreme_by(Math.max, predicate);
};
Array.prototype.unique = function() {
    return Array.from(new Set(this));
};
Array.equals = function(array_a, array_b) {
    for (let i = 0; i < Math.max(array_a.length, array_b.length); i++) {
        if (array_a[i] != array_b[i]) {
            return false;
        }
    }

    return true;
};

Array.prototype.last = function() {
    return this.get(-1);
};
Array.prototype.get = function(index=0) {
    if (index < 0) {
        return this[this.length + index];
    }

    return this[index];
};

function is_object(value) {
    return !!value && typeof value == 'object' && value.__proto__ == Object.prototype;
}
function is_boolean(value) {
    return value===true || value===false;
}
function is_array(value) {
    return Array.isArray(value);
}
function is_number(value) {
    return typeof value == 'number';
}
function is_integer(value) {
    return Number.isInteger(value);
}
function is_string(value) {
    return typeof value == 'string';
}


const deep_copy = function(element) {
    const references = [];
    const cached_results = [];

    return (function copy(element) {
        if (!element || typeof element !== 'object') {
            return element;
        }

        const index = references.indexOf(element);
        if (index >= 0) {
            return cached_results[index];
        }

        references.push(element);

        const result = new element.constructor();

        cached_results.push(result);

        if (Set.prototype.isPrototypeOf(element)) {
            for (const item of element) {
                result.add(copy(item));
            }
        }
        else for (const key in element) {
            if (element.hasOwnProperty(key)) {
                result[key] = copy(element[key]);
            }
        }

        return result;
    })(element);
};
