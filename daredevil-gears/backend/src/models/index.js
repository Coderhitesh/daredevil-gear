'use strict';

module.exports = {
  ...require('./user.models'),
  ...require('./catalog.models'),
  ...require('./commerce.models'),
  ...require('./content.models'),
  ...require('./ops.models'),
};
