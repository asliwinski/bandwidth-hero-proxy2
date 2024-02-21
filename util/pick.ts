export default (object, properties) => {
  const picked: typeof object = {};
  for (const key of properties) {
    if (object.hasOwnProperty(key)) {
      picked[key] = object[key];
    }
  }
  return picked;
};
