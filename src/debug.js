let DEBUG = false;

if (process.env.NODE_ENV === 'development') {
  DEBUG = true;
}

export function log(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

export default DEBUG;
