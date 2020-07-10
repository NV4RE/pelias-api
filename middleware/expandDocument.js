const dotProp = require('dot-prop');

function service(esclient) {
  function expandDocument(doc) {
    const traverse = (obj, cb, keypath) => {
      for (let k in obj) {
        const newkeypath = keypath ? keypath + '.' + k : k;

        // don't recurse down arrays so that we can send them to ES all at once
        if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
          traverse(obj[k], cb, newkeypath);
        } else {
          cb(obj[k], newkeypath);
        }
      }
    };

    const promises = [];
    doc.debug = doc.debug || {};
    doc.debug.expanded = {};

    // Go through every field in the doc
    traverse(doc, (value, keypath) => {
      if (!value || typeof value === 'number') {
        return;
      }
      promises.push(
        // For each field, send an RPC to elastic search to analyze it
        esclient.indices
          .analyze({ index: 'pelias', body: { field: keypath, text: value } })
          .then((tokens) => {
            // rebuild an object in doc.debug.expanded with the analysis results
            dotProp.set(doc.debug.expanded, keypath, tokens);
          })
          .catch(() => {})
      );
    });
    return Promise.all(promises);
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
