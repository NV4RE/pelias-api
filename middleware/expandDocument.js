const dotProp = require('dot-prop');
const _ = require('lodash');

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

    const lookupCb = (value, keypath) => {
      if (!value || typeof value === 'number') {
        return;
      }
      promises.push(
        // For each field, send an RPC to elastic search to analyze it
        // If you give ES the field name, it will match it to the analyzers specified in
        // the schema mapping, without needing to explicitly ask for any individual analyzers
        esclient.indices
          .analyze({ index: 'pelias', body: { field: keypath, text: value } })
          .then((tokens) => {
            // Group tokens by position and then make the output more compact
            const tokensByPosition = _.groupBy(tokens.tokens || [], (token) => token.position);
            const simplifiedTokensByPosition = _.mapValues(tokensByPosition, (tokens) =>
              tokens.map((token) => `${token.token} (${token.type})`)
            );

            // rebuild an object in doc.debug.expanded with the analysis results
            dotProp.set(doc.debug.expanded, keypath, simplifiedTokensByPosition);
          })
          .catch(() => {})
      );
    };

    // Go through every field in the doc
    traverse(doc, (value, keypath) => {
      // look up the analyzed version of this in ES
      lookupCb(value, keypath);
      // and also the dynamic .ngram version
      lookupCb(value, keypath + '.ngram');
    });

    // for each language on doc.name, simulate the unstored phrase.lang field
    _.forEach(doc.name, (v, k) => {
      lookupCb(v, 'phrase.' + k);
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
