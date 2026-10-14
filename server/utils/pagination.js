// Opt-in pagination. If the client sends no `page`, the full list is returned
// exactly as before. If it does, only that slice is returned and the totals
// travel in response headers so the JSON body stays a plain array.
//
//   const { skip, limit, paged } = readPaging(req.query);
//   ...query.skip(skip).limit(limit)
//   sendPage(res, total, req.query, items)
const DEFAULT_LIMIT = 20;

function readPaging(query) {
  if (query.page === undefined) return { paged: false, skip: 0, limit: 0 };
  const limit = query.limit || DEFAULT_LIMIT;
  return { paged: true, skip: (query.page - 1) * limit, limit };
}

function setPagingHeaders(res, total, query) {
  const limit = query.limit || DEFAULT_LIMIT;
  res.set({
    'X-Total-Count': String(total),
    'X-Total-Pages': String(Math.max(1, Math.ceil(total / limit))),
    'X-Page': String(query.page),
    'X-Limit': String(limit),
  });
}

module.exports = { readPaging, setPagingHeaders };
