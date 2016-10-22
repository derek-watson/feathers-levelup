const _ = {
  some: require('lodash/some'),
  isMatch: require('lodash/isMatch'),
  isEmpty: require('lodash/isEmpty'),
  each: require('lodash/each'),
  isObject: require('lodash/isObject'),
  cloneDeep: require('lodash/cloneDeep')
};

export const specialFilters = {
  $in (key, ins) {
    return current => ins.indexOf(current[key]) !== -1;
  },

  $nin (key, nins) {
    return current => nins.indexOf(current[key]) === -1;
  },

  $lt (key, value) {
    return current => current[key] < value;
  },

  $lte (key, value) {
    return current => current[key] <= value;
  },

  $gt (key, value) {
    return current => current[key] > value;
  },

  $gte (key, value) {
    return current => current[key] >= value;
  },

  $ne (key, value) {
    return current => current[key] !== value;
  }
};

export function matchesSpecialFilters (current, query) {
  var matches = true;

  if (query.$or) {
    if (!_.some(query.$or, or => _.isMatch(current, or))) {
      matches = false;
    }
  }

  _.each(query, (value, key) => {
    if (_.isObject(value)) {
      _.each(value, (target, prop) => {
        if (specialFilters[prop]) {
          if (!specialFilters[prop](key, target)(current)) {
            matches = false;
          }
        }
      });
    }
  });

  return matches;
}

export function filterSpecials (values, query) {
  return values.filter(obj => matchesSpecialFilters(obj, query));
}

export function stripSpecialFilters (query) {
  let newQuery = _.cloneDeep(query);

  delete newQuery.$or;

  _.each(newQuery, (value, key) => {
    if (_.isObject(value)) {
      _.each(value, (target, prop) => {
        if (specialFilters[prop]) {
          delete value[prop];
        }
      });
      if (_.isEmpty(value)) {
        delete newQuery[key];
      }
    }
  });

  return newQuery;
}

export function sorter ($sort) {
  return (first, second) => {
    let comparator = 0;
    _.each($sort, (modifier, key) => {
      modifier = parseInt(modifier, 10);

      if (first[key] < second[key]) {
        comparator -= 1 * modifier;
      }

      if (first[key] > second[key]) {
        comparator += 1 * modifier;
      }
    });
    return comparator;
  };
}
