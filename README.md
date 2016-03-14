
# feathers-levelup

> A service adapter for [LevelUP](https://github.com/Level/levelup), an interface to [LevelDB](http://leveldb.org/).

[![Build Status](https://travis-ci.org/derek-watson/feathers-levelup.png?branch=master)](https://travis-ci.org/derek-watson/feathers-levelup)

**Table of Contents**

- [feathers-levelup](#feathers-levelup)
  - [Installation](#installation)
  - [Documentation](#documentation)
  - [Getting Started](#getting-started)
    - [Complete Example](#complete-example)
  - [Key Generation and Sort Order](#key-generation-and-sort-order)
  - [Efficient Range Queries](#efficient-range-queries)
  - [Authors](#authors)
  - [Changelog](#changelog)
  - [License](#license)


## Installation

```bash
npm install feathers-levelup --save
```

## Documentation

Please refer to the [Feathers database adapter documentation](http://docs.feathersjs.com/databases/readme.html) for more details or directly at:

- [LevelUP](http://docs.feathersjs.com/databases/levelup.html) - The detailed documentation for this adapter
- [Extending](http://docs.feathersjs.com/databases/extending.html) - How to extend a database adapter
- [Pagination and Sorting](http://docs.feathersjs.com/databases/pagination.html) - How to use pagination and sorting for the database adapter
- [Querying](http://docs.feathersjs.com/databases/querying.html) - The common adapter querying mechanism


## Getting Started

Creating a LevelUP service:

```bash
npm install levelup leveldown feathers-levelup --save
```

```js
const levelup = require('levelup');
const levelupService = require('feathers-levelup');

const db = levelup('./todos', { valueEncoding: 'json' });

app.use('/todos', levelupService({ db: db }));
```

See the [LevelUP Guide](https://github.com/Level/levelup) for more information on configuring your database, including selecting a backing store.

### Complete Example

Here's a complete example of a Feathers server with a `message` levelup service.

```js
const service = require('./lib');
const levelup = require('levelup');
const feathers = require('feathers');
const rest = require('feathers-rest');
const bodyParser = require('body-parser');
const socketio = require('feathers-socketio');

var db = levelup('./messages', {
  valueEncoding: 'json'
});

// Create a feathers instance.
const app = feathers()
  // Enable Socket.io
  .configure(socketio())
  // Enable REST services
  .configure(rest())
  // Turn on JSON parser for REST services
  .use(bodyParser.json())
  // Turn on URL-encoded parser for REST services
  .use(bodyParser.urlencoded({extended: true}));

// Connect to the db, create and register a Feathers service.
app.use('messages', service({
  db: db,
  name: 'message',
  paginate: {
    default: 2,
    max: 4
  }
}));

app.listen(3030);
console.log('Feathers Message levelup service running on 127.0.0.1:3030');
```

You can run this example by using `npm start` and going to [localhost:3030/messages](http://localhost:3030/messages). You should see an empty array. That's because you don't have any messages yet but you now have full CRUD for your new message service.

## Key Generation and Sort Order

By default, LevelDB stores entries lexicographically [sorted by key](http://leveldb.org/). The sorting is one of the main distinguishing features of LevelDB.

When feathers-levelup services `create` records, a key is generated based on a the value of the `sortField` configuration option, plus a uuid. By default `_createdAt`, a built-in timestamp field is used, which is a good fit for time series data.

Change the `sortField` option to the field of your choice to configure key ordering:

```js
app.use('todos', service({
  db: db,
  sortField: '_createdAt' // this field value will be prepended to the db key
  name: 'todo',
  paginate: {
    default: 2,
    max: 4
  }
}));

const todos = app.service('todos');

todos
  .create({task: 'Buy groceries'})
  .then(console.log);
```

```js
{ task: 'Buy groceries',
  _createdAt: 1457923734510,
  id: '1457923734510:0:d06afc7e-f4cf-4381-a9f9-9013a6955562' }
```

## Efficient Range Queries

To avoid memory-hungry `_find` calls that load the entire key set for processing, sort by the `options.sortField`, or don't pass a sort option at all, taking advantage of the natural sort order of the keys in the database.

Use `$gt`, `$gte`, `$lt`, `$lte` and `$limit` to perform
fast range queries over your data.

```js
app.use('todos', service({
  db: db,
  sortField: '_createdAt' // db keys are sorted by this field value
  name: 'todo',
  paginate: {
    default: 2,
    max: 4
  }
}));

const todos = app.service('todos');

todos
  .find({
    query: {
      _createdAt: {
        $gt: '1457923734510'    // keys starting with this _createdAt
      },
      $limit: 10                // load the first ten
    }
  })
```

## Authors

- [Derek Watson](http://twg.ca)

## Changelog

__1.0.0__

- Initial release

## License

Copyright (c) 2016

Licensed under the [MIT license](LICENSE).
