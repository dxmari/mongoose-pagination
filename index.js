const getUrls = (opts) => {
    let limit = opts.limit;
    let skip = opts.skip;
    let url = opts.url;
    let itemCount = opts.count;

    var parameters = getUrlParameters(url);

    url = Object.keys(parameters).length == 0 ? url += '?limit=&offset=' : url;
    url = parameters['limit'] ? url : url.replace('limit=', ('limit=' + limit));
    url = parameters['offset'] ? url : url.replace('offset=', ('offset=' + skip));

    let next_url = null,
        prev_url = null;

    let offset = limit + skip;

    if (offset < itemCount) {
        next_url = url.replace(('offset=' + skip), "offset=" + offset);
    }
    if (itemCount > 0 && skip > 0) {
        let offset = skip - limit;
        prev_url = url.replace(('offset=' + skip), "offset=" + (offset < 0 ? 0 : offset));
    }
    var result = {
        count: itemCount,
        next: next_url,
        previous: prev_url,
        results: []
    };
    return result;
}

const getUrlParameters = (url) => {
    var vars = {};
    var parts = url.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (m, key, value) {
        vars[key] = value;
    });
    return vars;
}

function paginate(schema, opts) {
    opts = Object.assign({}, (paginate.options || {}), opts);
    let defaultLimit = (opts ? (opts.defaultLimit ? opts.defaultLimit : 10) : 10);
    let defaultSkip = (opts ? (opts.defaultSkip ? opts.defaultSkip : 0) : 0)
    let result;
    schema.statics.aggregatePaginate = function (pipelines, options, callback) {
        return new Promise(async (resolve, reject) => {
            let paginateOpts;
            if (options && options.req) {
                paginateOpts = {
                    url: options.req.protocol + `${options.is_secure ? 's' : ''}://` + options.req.get('host') + options.req.originalUrl,
                    limit: parseInt(options.limit || defaultLimit),
                    skip: parseInt(options.skip || defaultSkip),
                    count: 0
                }
            }
            let itemCount = 0;
            try {
                itemCount = await this.aggregate(pipelines).count('count');
            } catch (err) {
                if (callback) {
                    callback(err, null);
                }
                return reject(err);
            }
            if (itemCount && itemCount[0]) {
                itemCount = itemCount[0].count;
            } else {
                itemCount = 0;
            }
            if (paginateOpts && paginateOpts.url) {
                pipelines.push({ '$skip': paginateOpts.skip })
                pipelines.push({ '$limit': paginateOpts.limit })
            }
            paginateOpts.count = itemCount;
            result = getUrls(paginateOpts);
            if (itemCount == 0) {
                if (callback) {
                    callback(null, result);
                }
                return resolve(result);
            }
            this
                .aggregate(pipelines)
                .exec((err, querySet) => {
                    result.results = querySet;
                    if (callback) {
                        if (err) {
                            result = null;
                        }
                        callback(err, result);
                    }
                    if (err) return reject(err);
                    resolve(result);
                })
        })
    }

    class Paginate {
        static findWithPaginate(query, options, callback) {
            return new Promise(async (resolve, reject) => {
                let paginateOpts;
                if (options && options.req) {
                    paginateOpts = {
                        url: options.req.protocol + `${options.is_secure ? 's' : ''}://` + options.req.get('host') + options.req.originalUrl,
                        limit: parseInt(options.limit || defaultLimit),
                        skip: parseInt(options.skip || defaultSkip),
                        count: 0
                    }
                }
                let itemCount = await this.countDocuments(query);
                paginateOpts.count = itemCount;
                result = getUrls(paginateOpts);

                this
                    .find(query)
                    .select(this.selectOpts)
                    .populate(this.populateOpts)
                    .skip(paginateOpts.skip)
                    .limit(paginateOpts.limit)
                    .exec((err, querySet) => {
                        result.results = querySet;
                        if (callback) {
                            if (err) {
                                result = null;
                            }
                            callback(err, result);
                        }
                        if (err) return reject(err);
                        resolve(result);
                    });
            });
        }
        static paginateSelect(opts) {
            this.selectOpts = opts;
            return this;
        }
        static paginatePopulate(opts) {
            this.populateOpts = opts;
            return this;
        }
    }
    schema.loadClass(Paginate);
};
module.exports = paginate;