module.exports = [
  { ignores: ['examples/cases/**', 'app/build/**'] },
  ...require('neostandard')({ files: ['app/**/*.js'] })
]
