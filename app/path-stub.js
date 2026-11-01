'use strict'

// Peacock only needs path.join when its theme is a string or file path.
// Deoptigate always passes a theme object, so path resolution is unavailable
// and unnecessary in the browser bundle.
module.exports = {}
