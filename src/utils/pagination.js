const { PAGINATION } = require('../constants');

const getPaginationParams = (query) => {
  // SECURITY FIX: Validate page number to prevent negative skip values
  let page = parseInt(query.page, 10) || PAGINATION.DEFAULT_PAGE;
  page = Math.max(1, page); // Ensure page is at least 1

  // SECURITY FIX: Ensure limit doesn't exceed maximum to prevent DoS
  const limit = Math.min(
    Math.max(1, parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT),
    PAGINATION.MAX_LIMIT
  );

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const getPaginationMeta = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage,
    hasPrevPage
  };
};

module.exports = {
  getPaginationParams,
  getPaginationMeta
};
