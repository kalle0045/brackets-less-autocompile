/*jshint node: true, evil: true */
'use strict';

var less = require('less');
var LessPluginAutoPrefix = require('less-plugin-autoprefix');
var LessPluginCleanCSS = require('less-plugin-clean-css');
var path = require('path');
var fs = require('fs');
var mkpath = require('mkpath');

function readOptions(content) {
  var firstLine = content.substr(0, content.indexOf('\n'));
  var match = /^\s*\/\/\s*(.+)/.exec(firstLine);
  var options = {};

  if (!match) {
    return options;
  }

  match[1].split(',').forEach(function (item) {
    var key, value, i = item.indexOf(':');
    if (i < 0) {
      return;
    }
    key = item.substr(0, i).trim();
    value = item.substr(i + 1).trim();
    if (value.match(/^(true|false|undefined|null|[0-9]+)$/)) {
      value = eval(value);
    }
    options[key] = value;
  });
  return options;
}

// makes a file in a path where directories may or may not have existed before
function mkfile(filepath, content, callback) {
  mkpath(path.dirname(filepath), function (err) {
    if (err) {
      return callback ? callback(err) : undefined;
    }
    fs.writeFile(filepath, content, callback);
  });
}

// compile the given less file
function compile(lessFile, callback) {

  fs.readFile(lessFile, function (err, buffer) {
    if (err) {
      return callback(err);
    }

    var content = buffer.toString();
    var options = readOptions(content);
    var lessPath = path.dirname(lessFile);
    var cssFilename;
    var cssFile;

    // main is set: compile the referenced file instead
    if (options.main) {
      lessFile = path.resolve(lessPath, options.main);
      return compile(lessFile, callback);
    }

    // out is null or false: do not compile
    if (options.out === null || options.out === false) {
      return callback();
    }

    // out is set: output to the given file name
    if (options.out) {
      cssFilename = options.out;
      if (path.extname(cssFilename) === '') {
        cssFilename += '.css';
      }
      delete options.out;
    } else {
      cssFilename = path.basename(lessFile);
      cssFilename = cssFilename.substr(0, cssFilename.length - path.extname(cssFilename).length) + '.css';
    }
    cssFile = path.resolve(lessPath, cssFilename);

    // source map file name and url
    // not supported with cleancss plugin
    if (!options.cleancss && options.sourceMap) {
      options.sourceMap = {};
      options.sourceMap.sourceMapURL = options.sourceMapURL;
      options.sourceMap.sourceMapBasepath = options.sourceMapBasepath || lessPath;
      options.sourceMap.sourceMapRootpath = options.sourceMapRootpath;
      options.sourceMap.outputSourceFiles = options.outputSourceFiles;
      options.sourceMap.sourceMapFileInline = options.sourceMapFileInline;
      if (options.sourceMapFileInline) {
        options.sourceMap.sourceMapFileInline = true;
      } else {
        if (options.sourceMapFilename) {
          options.sourceMapFilename = path.resolve(lessPath, options.sourceMapFilename);
        } else {
          options.sourceMapFilename = cssFile + '.map';
        }
        if (!options.sourceMap.sourceMapURL) {
          options.sourceMap.sourceMapURL = path.relative(cssFile + path.sep + '..', options.sourceMapFilename);
        }
      }
    }

    // set the path
    options.paths = [lessPath];
    options.filename = lessFile;
    // options.rootpath = lessPath;

    // plugins
    options.plugins = [];

    // autoprefixer
    if (options.autoprefixer) {
      var autoprefixerOptions = {};
      if (typeof options.autoprefixer === 'string') {
        autoprefixerOptions.browsers = [options.autoprefixer];
      }
      options.plugins.push(new LessPluginAutoPrefix(autoprefixerOptions));
    }

    // clean-css
    if (options.cleancss) {
      var cleancssOptions = {};
      if (typeof options.cleancss === 'string') {
        cleancssOptions.compatibility = options.cleancss;
      }
      options.plugins.push(new LessPluginCleanCSS(cleancssOptions));
    }

    // set up the parser
    less.render(content, options).then(function (output) {
      var css = output.css;

      // add version tag
      if (!options.compress && !options.cleancss) {
        css = '/* Generated by less ' + less.version.join('.') + ' */\n' + css;
      }

      // write output
      mkfile(cssFile, css, function (err) {
        if (err) {
          return callback(err);
        }

        // write source map
        if (output.map && options.sourceMapFilename) {
          mkfile(options.sourceMapFilename, output.map, function (err) {
            if (err) {
              return callback(err);
            }
            callback(null, { filepath: cssFile, output: css });
          });
        } else {
          callback(null, { filepath: cssFile, output: css });
        }
      });

    }, callback);
  });

}

// set up service for brackets
function init(DomainManager) {
  if (!DomainManager.hasDomain('LessCompiler')) {
    DomainManager.registerDomain('LessCompiler', { major: 1, minor: 0 });
  }
  DomainManager.registerCommand(
    'LessCompiler', // domain name
    'compile', // command name
    compile, // command handler function
    true, // this command is asynchronous
    'Compiles a less file', ['lessPath'], // path parameters
    null);
}

exports.init = init;
