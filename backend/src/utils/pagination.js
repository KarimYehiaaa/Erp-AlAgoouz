export const getPaginationParams = (filters = {}, defaultLimit = 100, maxLimit = 500) => {
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(Math.max(1, parseInt(filters.limit) || defaultLimit), maxLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

export const buildPaginationMeta = (total, page, limit) => {
  return {
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit)
  };
};
