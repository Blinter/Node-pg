const validateInput = (value, fieldName) => {
  if (!value ||
    value.trim() === '')
    return new Error(`Invalid ${fieldName}: cannot be empty`);
  switch (fieldName) {
    case 'code':
      if (!/^[A-Za-z0-9]{3,10}$/.test(value))
        return new Error('Invalid code: must be 3-10 alphanumeric characters');
      break;
    case 'name':
      if (!/^[A-Za-z0-9\s-]+$/.test(value))
        return new Error('Invalid name: must contain only letters, numbers, spaces, and hyphens');
      break;
    case 'description':
      if (value.length > 255)
        return new Error('Invalid description: exceeds maximum length of 255 characters');
      break;
    default:
      return new Error(`Invalid field: ${fieldName}`);
  }
  return true;
};

const sanitizeInput = (value) =>
  typeof value === 'string' ?
    value.replace(/[^a-zA-Z0-9\s-]/g, '') : value;

module.exports = { validateInput, sanitizeInput };