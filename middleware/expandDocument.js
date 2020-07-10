const dotProp = require('dot-prop');

function service(apiConfig, esclient) {
  function expandDocument(doc) {
    const traverse = (obj, cb, keypath) => {
      for (let k in obj) {
        const newkeypath = keypath ? keypath + '.' + k : k;

        if (obj[k] && typeof obj[k] === 'object') {
          //} && !Array.isArray(obj[k])) {
          traverse(obj[k], cb, newkeypath);
        } else {
          cb(obj[k], newkeypath);
        }
      }
    };

    console.log(doc);

    const promises = [];
    doc.debug = doc.debug || {};
    doc.debug.expanded = {};

    traverse(doc, (value, keypath) => {
      console.log({ keypath, value });
      if (!value) {
        return;
      }
      if (typeof value === 'number') {
        return;
      }
      if (Array.isArray(value)) {
        return;
      }
      promises.push(
        esclient.indices
          .analyze({ index: 'pelias', body: { field: keypath, text: value } })
          .then((tokens) => {
            console.log({ keypath, value, tokens });
            dotProp.set(doc.debug.expanded, keypath, tokens);
          })
          .catch((err) => console.error(err))
      );
    });
    return promises;
  }

  return (req, res, next) => {
    if (req.clean.enableDebug && res.data) {
      Promise.all(res.data.map(expandDocument)).then(() => next());
    } else {
      next();
    }
  };
}

module.exports = service;
