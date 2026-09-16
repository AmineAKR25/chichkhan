// Shared by the server (search suggestions) and the browser (search).
export const normalize = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/['‘’ʼ´`]/g, "");
export const matches = (item, category, query) =>
  normalize(query)
    .trim()
    .split(/\s+/)
    .every((word) =>
      normalize(`${item.name} ${item.description} ${category}`).includes(word),
    );
