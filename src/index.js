import uuid from 'uuid';
import Proto from 'uberproto';
import errors from 'feathers-errors';
import filter from 'feathers-query-filters';
import {
  sorter,
  matchesSpecialFilters,
  stripSpecialFilters,
  filterSpecials
} from './utils';

if (!global._babelPolyfill) { require('babel-polyfill'); }

const _ = {
  values: require('lodash/values'),
  isEmpty: require('lodash/isEmpty'),
  where: require('lodash/filter'),
  extend: require('lodash/extend'),
  omit: require('lodash/omit'),
  pick: require('lodash/pick'),
  clone: require('lodash/clone')
};

var counter = -1;

class Service {
  constructor (options = {}) {
    if (!options.db) {
      throw new Error('You must provide a LevelUP database instance');
    }

    if (options.db.options.valueEncoding !== 'json') {
      throw new Error('LevelUP valueEncoding option must be set to "json"');
    }

    this.db = options.db;
    this.paginate = options.paginate || {};
    this._id = options.idField || 'id';
    this.sortField = options.sortField || '_createdAt';
  }

  createKey (obj) {
    counter += 1;
    let uid = uuid.v4();
    let prefix = (this.sortField && obj[this.sortField]) ? obj[this.sortField].toString() : '';

    return `${prefix}:${counter}:${uid}`;
  }

  extend (obj) {
    return Proto.extend(obj, this);
  }

  // loads entire data set and performs an in-memory
  // filter, sort, skip, limit and select
  _findInMemory (query, filters) {
    return new Promise((resolve, reject) => {
      var values = [];

      this.db.createReadStream()
        .on('data', obj => {
          values.push(obj.value);
        })
        .on('end', () => {
          values = filterSpecials(values, query);

          var plainQuery = stripSpecialFilters(query);

          if (!_.isEmpty(plainQuery)) {
            values = _.where(values, plainQuery);
          }

          const total = values.length;

          if (filters.$sort) {
            values.sort(sorter(filters.$sort));
          }

          if (filters.$skip) {
            values = values.slice(filters.$skip);
          }

          if (filters.$limit) {
            values = values.slice(0, filters.$limit);
          }

          if (filters.$select) {
            values = values.map(value => _.pick(value, filters.$select));
          }

          resolve({
            total,
            limit: filters.$limit,
            skip: filters.$skip || 0,
            data: values
          });
        })
        .on('error', err => {
          reject(new errors.GeneralError(`Internal error reading database: ${err}`));
        });
    });
  }

  // performs an efficient range query over a sorted set,
  // collecting matching results until we satisfy our pagination limit
  _findOptimized (query, filters) {
    return new Promise((resolve, reject) => {
      let total = 0;
      let values = [];
      let options = {};
      let skipped = 0;

      if (filters.$sort) {
        if (filters.$sort[this.sortField] < 0) {
          options.reverse = true;
        }
      }

      if (query && query[this.sortField]) {
        ['gt', 'lt', 'gte', 'lte'].forEach((op) => {
          if (query[this.sortField].hasOwnProperty('$' + op)) {
            options[op] = query[this.sortField]['$' + op];
          }
        });
      }

      this.db.createReadStream(options)
        .on('data', obj => {
          if (!matchesSpecialFilters(obj.value, query)) {
            return;
          }

          var plainQuery = stripSpecialFilters(query);

          if (!_.isEmpty(plainQuery)) {
            if (_.where([obj.value], plainQuery).length === 0) {
              return;
            }
          }

          total += 1;

          if (filters.$skip && skipped < filters.$skip) {
            skipped += 1;
            return;
          }

          if (filters.$limit && values.length >= filters.$limit) {
            return;
          }

          values.push(obj.value);
        })
        .on('end', () => {
          if (filters.$select) {
            values = values.map(value => _.pick(value, filters.$select));
          }

          resolve({
            total,
            limit: filters.$limit,
            skip: filters.$skip || 0,
            data: values
          });
        })
        .on('error', err => {
          reject(new errors.GeneralError(`Internal error reading database: ${err}`));
        });
    });
  }

  _canPerformOptimized (query, filters) {
    if (!filters.$sort) {
      return true;
    }

    if (Object.keys(filters.$sort).length === 1) {
      if (filters.$sort.hasOwnProperty(this.sortField)) {
        return true;
      }
    }

    return false;
  }

  // Find without hooks and mixins that can be used internally and always returns
  // a pagination object
  _find (params, getFilter = filter) {
    const { filters, query } = getFilter(params.query || {});

    return this._canPerformOptimized(query, filters)
      ? this._findOptimized(query, filters)
      : this._findInMemory(query, filters);
  }

  find (params) {
    const paginate = typeof params.paginate !== 'undefined' ? params.paginate : this.paginate;
    // Call the internal find with query parameter that include pagination
    const result = this._find(params, query => filter(query, paginate));

    if (!paginate.default) {
      return result.then(page => page.data);
    }

    return result;
  }

  get (...args) {
    return this._get(...args);
  }

  _get (id) {
    return new Promise((resolve, reject) => {
      this.db.get(id, function (err, data) {
        if (err) {
          if (err.notFound) {
            return reject(new errors.NotFound(`No record found for id '${id}'`));
          }
          return reject(new errors.GeneralError(`Internal error fetching id '${id}' (${err})`));
        }

        resolve(data);
      });
    });
  }

  // Create without hooks and mixins that can be used internally
  _create (data) {
    let current = _.extend({}, data, {
      _createdAt: data._createdAt || new Date().getTime()
    });

    let id = current[this._id] = this.createKey(current);

    return new Promise((resolve, reject) => {
      this.db.put(id, current, function (err) {
        if (err) {
          return reject(new errors.GeneralError(`Internal error creating id '${id}' (${err})`));
        }
        resolve(current);
      });
    });
  }

  create (data) {
    if (Array.isArray(data)) {
      return Promise.all(data.map(current => this._create(current)));
    }

    return this._create(data);
  }

  update (id, data) {
    if (id === null || Array.isArray(data)) {
      return Promise.reject(new errors.BadRequest(
        `You can not replace multiple instances. Did you mean 'patch'?`
      ));
    }

    return this
      ._get(id)
      .then(() => {
        return new Promise((resolve, reject) => {
          let current = _.extend({}, data, { [this._id]: id });

          this.db.put(id, current, function (err) {
            if (err) {
              return reject(new errors.GeneralError(`Internal error updating id '${id}' (${err})`));
            }
            resolve(current);
          });
        });
      });
  }

  // Patch without hooks and mixins that can be used internally
  _patch (id, updateData) {
    return this
      ._get(id)
      .then((old) => {
        return new Promise((resolve, reject) => {
          var current = _.extend(old, updateData);
          this.db.put(id, current, function (err) {
            if (err) {
              return reject(new errors.GeneralError(`Internal error updating id '${id}' (${err})`));
            }
            resolve(current);
          });
        });
      });
  }

  patch (id, data, params) {
    if (id === null) {
      return this._find(params).then(page => {
        return Promise.all(page.data.map(
          current => this._patch(current[this._id], data, params))
        );
      });
    }

    return this._patch(id, data, params);
  }

  // Remove without hooks and mixins that can be used internally
  _remove (id) {
    return this
      ._get(id)
      .then((data) => {
        return new Promise((resolve, reject) => {
          this.db.del(id, function (err) {
            if (err) {
              return reject(new errors.GeneralError(`Internal error removing id '${id}' (${err})`));
            }
            resolve(data);
          });
        });
      });
  }

  remove (id, params) {
    if (id === null) {
      return this._find(params).then(page =>
        Promise.all(page.data.map(current => this._remove(current[this._id])
      )));
    }

    return this._remove(id);
  }
}

export default function init (options) {
  return new Service(options);
}

init.Service = Service;
