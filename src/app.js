var googleImages = require('google-images');
var exif = require('exif2');
var request = require('request');
var fs = require('fs');
var md5 = require('MD5');
var shredfile = require('shredfile')({});
var gui = require('nw.gui');
var exec = require('child_process').exec;
var csv = require('csv-to-json');
var http = require('http');
var urlHelper = require('url');
var fdialogs = require('node-webkit-fdialogs');

var packageJsonFile = fs.readFileSync('package.json');
packageJson = JSON.parse(packageJsonFile);
useragent = packageJson['user-agent'];

// Mouse positions; see readMouseMove().
var x;
var y;

/**
 * Searches Google for images and appends the results to the page.
 * @param string query - The query to search for.
 */
function imageSearch(query) {
  var resultsCount = 0;
  var imagesDiv = document.getElementById('images');
  var endOfResults = document.getElementById('eor');
  var eorBreak = document.getElementById('eor-break');

  // The deprecated Google Images API only allows us to recieve a maximum
  // of 60 results.
  for (var i = 0; i < 57; i = i +4) {
    // NOTE: Eventually this should be refactored, but I'm not overly
    // concerned about it at this time.

    /* jshint loopfunc: true */
    googleImages.search(query, { page: i, proxy: getSetting('proxy'), callback: function(err, images) {
      var resultsDiv = document.getElementById('results');
      if (images[0]) {
        results.className = 'page-header';

        // Until we have some results, just show 0. Better than nothing, right?
        if(resultsCount === 0) {
          results.innerHTML = '<h3>0 Results</h3>';
        }
        images.forEach(function(image) {
          // NOTE: This is a little hack I implemented to replace imgur
          // thumbnails with the full image.
          if (image.url.substring(0, 19) === 'http://i.imgur.com/') {
            image.url = image.url.replace('b.jpg', '.jpg');
          }

          var options = { url: safeDecodeURIComponent(image.url),
                          proxy: getSetting('proxy'),
                          headers: { 'User-Agent': useragent } };

          resultsCount++;
          var file = fs.createWriteStream('./tmp/' + md5(image.url));
          var req = request(options);
          req.pipe(file);

          req.on('error', function() {
            // If we have an error, ignore it. This is temporary. I'll likely
            // end up writing it to console or a log file, but these are things
            // which usually are caused by strange servers doing strange things.
          });

          req.on('end', function() {
            exif ('./tmp/' + md5(image.url), function(err, obj) {
              var exifData = '';
              if (err === null) {
                for(var key in obj) {
                  if (obj.hasOwnProperty(key) &&
                      key !== 'exiftool version number' &&
                      key !== 'file name' &&
                      key !== 'directory' &&
                      key !== 'file inode change date time' &&
                      key !== 'file modification date time' &&
                      key !== 'file access date time' &&
                      key !== 'file permissions') {
                      exifData += ucwords(key) + ': ' + obj[key] + '<br>';
                  }
                }
              } else {
                exifData = err;
              }
              shredfile.shred('./tmp/' + md5(image.url), function(err, file) {

              });
              results.innerHTML = '<h3>' + resultsCount + ' Results</h3>';

              // If we don't have a proxy setup there's no point in trying to
              // proxy the image.
              var src = proxifyUrl(image.url);
              if(getSetting('proxy') === '') {
                src = image.url;
              }

              // Let's pretend I never wrote this...
              /* jshint maxlen: false */
              imagesDiv.innerHTML += '<div class="thumbnail"><img id="' + md5(image.url) + '" src="' + src + '" title="' + getFileName(image.url) + '" onclick="showExifData(\'' + image.url + '\', \'' + window.btoa(unescape(encodeURIComponent(exifData))) + '\')" oncontextmenu="showContextMenu(\'' + image.url + '\', \'' + image.from + '\')"><br><br></div>';
              eorBreak.className = '';
              endOfResults.className = 'lead text-center text-muted';
            });
          });
        });
      } else {
        eorBreak.className = 'hidden';
        endOfResults.className = 'lead text-center text-muted hidden';
        results.className = 'page-header';
        results.innerHTML = '<h3>No images found.</h3>';
        return false;
      }
    }});
  }
}

/**
 * Takes a string and capitalizes the first letter of each word.0
 * @param string str - The string to convert to uppercase.
 */
function ucwords(str) {
    return (str + '').replace(/^([a-z])|\s+([a-z])/g, function($1) {
        return $1.toUpperCase();
    });
}

// Stolen! Credits go to this chap: http://stackoverflow.com/users/1219011/twist
// Original: http://stackoverflow.com/a/11840120
// Modified to remove non-webkit CSS rules.
function getRotationDegrees(obj) {
  var angle;
  var matrix = obj.css('-webkit-transform') ||
  obj.css('transform');
  if (matrix !== 'none') {
    var values = matrix.split('(')[1].split(')')[0].split(',');
    var a = values[0];
    var b = values[1];
    angle = Math.round(Math.atan2(b, a) * (180/Math.PI));
  } else {
    angle = 0;
  }
  return (angle < 0) ? angle +=360 : angle;
}

/**
 * Shows a modal containing the EXIF data of an image.
 * @param string url - The URL where the image is located.
 * @param string data - A base64 encoded string containing the EXIF data.
 */
function showExifData(url, data) {
  var exifData = document.getElementById('exif-data');
  var exifTitle = document.getElementById('exif-title');

  exifTitle.innerHTML = getFileName(url);
  exifData.innerHTML = window.atob(data);
  $('#exif-data-modal').modal('show');
}

/**
 * Shows a context menu when right clicking on an image.
 * @param string url - The URL where the image is located.
 * @param string data - The URL of the page it came from.
 */
function showContextMenu(url, from) {
  // TODO: Reduce the amount of statements. Yeah, this is a pile of fuck.
  /* jshint maxstatements:25 */
  var menu = new gui.Menu();
  var clipboard = gui.Clipboard.get();

  var flipImageItem = new gui.MenuItem(
    { label: 'Toggle Flip Image',
      click: function() {
        var image = $('img[src="' + url + '"]');
        if (image.hasClass('flipped')) {
          image.removeClass('flipped');
        } else {
          image.addClass('flipped');
        }
      }
    });

  // TODO: Shred images.
  var genderAgeItem = new gui.MenuItem(
    { label: 'Age/Gender (Experimental)',
      click: function() {
        var file = fs.createWriteStream('./tmp/br/' + md5(url) + '.image');

        var options = { url: safeDecodeURIComponent(url),
                        proxy: getSetting('proxy'),
                        headers: { 'User-Agent': useragent } };

        var req = request(options);
        req.pipe(file);

        req.on('end', function() {
          exec('br -algorithm GenderEstimation -enroll ' + process.cwd() +
               '/tmp/br/' + md5(url) + '.image ' + process.cwd() +
               '/tmp/br/gender_' + md5(url) + '.csv', function(err, result) {
            if (err) {
              alert(err);
              return;
            }
            var genderResult = csv.parse('./tmp/br/gender_' + md5(url) +
                                         '.csv');

            var gender = genderResult[0].Gender;
            if (typeof(gender) === 'undefined') {
              gender = 'Unknown';
            }
            var genderSpan = document.getElementById('gender');
            genderSpan.innerHTML = gender;
          });

          exec('br -algorithm AgeEstimation -enroll ' + process.cwd() +
               '/tmp/br/' + md5(url) + '.image ' + process.cwd() +
               '/tmp/br/age_' + md5(url) + '.csv', function(err, result) {
            if (err) {
              alert(err);
              return;
            }
            var ageResult = csv.parse('./tmp/br/age_' + md5(url) + '.csv');

            var age = ageResult[0].Age;
            var ageSpan = document.getElementById('age');
            if (typeof(age) === 'undefined') {
              ageSpan.innerHTML = 'Unknown';
            } else {
              ageSpan.innerHTML = Math.round(age);
            }
          });
          $('#age-gender-modal').modal('show');
        });
      }
    });

  var viewFullImageItem = new gui.MenuItem(
    { label: 'View Full Image',
      click: function() {
        var src = proxifyUrl(url);
        if(getSetting('proxy') === '') {
          src = url;
        }

        var pwin = open('private.html');
        pwin.document.write('<img src="' + src + '">');
      }
    });

  var previewPageItem = new gui.MenuItem(
    { label: 'Preview Page (No Proxy)',
      click: function() {
        // Let's pretend I never wrote this...
        /* jshint maxlen: false */
        var pwin = open('private.html');
        pwin.document.write('<iframe src="' + from + '" style="border: 0; position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%" sandbox></iframe>');
      }
    });

  var rotateRightItem = new gui.MenuItem(
    { label: 'Rotate Right',
      click: function() {
        var degrees = getRotationDegrees($('img[src="' + url + '"]'));
        $('img[src="' + url + '"]').rotate(degrees + 90);
      }
    });

  var rotateLeftItem = new gui.MenuItem(
    { label: 'Rotate Left',
      click: function() {
        var degrees = getRotationDegrees($('img[src="' + url + '"]'));
        $('img[src="' + url + '"]').rotate(degrees - 90);
      }
    });

  var copyImageUrlItem = new gui.MenuItem(
    { label: 'Copy Image URL',
      click: function() {
        clipboard.set(safeDecodeURIComponent(url), 'text');
      }
    });

  var copyPageUrlItem = new gui.MenuItem(
    { label: 'Copy Page URL',
      click: function() {
        clipboard.set(safeDecodeURIComponent(from), 'text');
      }
    });

  var saveImageItem = new gui.MenuItem(
    { label: 'Save Image',
      click: function() {
        var imageData = '';

        var options = { url: safeDecodeURIComponent(url),
                        proxy: getSetting('proxy'),
                        encoding: 'binary',
                        headers: { 'User-Agent': useragent } };

        request(options, function(error, response, body) {
          var content = new Buffer(body, 'binary');
          var fileName = getFileName(url);

          fdialogs.saveFile(content, fileName, function (err, path) {
              if(err) {
                alert('Could not save image. Reason: ' + err);
              }
          });
        });
      }
    });

  // It's my party and I'll cry if I want to.
  menu.append(viewFullImageItem);
  menu.append(previewPageItem);
  menu.append(copyImageUrlItem);
  menu.append(copyPageUrlItem);
  menu.append(saveImageItem);
  menu.append(new gui.MenuItem({ type: 'separator' }));
  menu.append(rotateLeftItem);
  menu.append(rotateRightItem);
  menu.append(flipImageItem);
  menu.append(genderAgeItem);
  menu.popup(x, y);
}

/**
 * Retrieves a setting from the browser's local storage
 * @param string name - The name of the setting.
 */
function getSetting(name) {
  var defaultSettings = {
    'proxy': '',
    'local-proxy-port': '',
    'deletion': 'shred-images'
  };

  if(localStorage.getItem(name)) {
    return localStorage.getItem(name);
  } else {
    return defaultSettings[name];
  }
}

/**
 * Saves a setting (either creating or modifying) in the browser's local
 * storage.
 * @param string name - The name of the setting.
 * @param string value - The value of the setting.
 */
function saveSetting(name, value) {
  localStorage.setItem(name, value);
}

/**
 * Allows a URL to be accessed over a user configurable proxy server.
 * @param string url - The URL to proxy.
 */
function proxifyUrl(url) {
  return 'http://127.0.0.1:' + getSetting('local-proxy-port') +
         '/get?url=' + url;
}

/**
 * Takes a URL and decodes it, if possible. If it can't it returns the
 * original URL.
 * @param string url - The URL to decode.
 */
function safeDecodeURIComponent(url) {
  try {
    return decodeURIComponent(url);
  } catch (ex) {
    return url;
  }
}

/**
 * Takes a URL and parses the file name out of it. Example:
 * http://www.example.com/images/logo.png -> logo.png
 * @param string url - The URL to parse.
 */
function getFileName(url) {
  // NOTE: I tried to get this to unescape the file name, but failed. Epicly.
  // If you know how to do this, feel free to submit a pull request.
  var parsedUrl = urlHelper.parse(url);
  var splitUrl = parsedUrl.path.split('/');
  return splitUrl[splitUrl.length-1];
}

/**
 * Tracks the cursor's position and stores the location.
 * @param event e - The event to on which it's triggered.
 */
function readMouseMove(e) {
  x = e.clientX;
  y = e.clientY;
}

$(document).ready(function() {
  document.onmousemove = readMouseMove;

  document.onkeydown = function(e) {
    // Debug console (` key)
    if (e.keyCode === 192) {
      e.preventDefault();
      gui.Window.get().showDevTools();
      return false;
    }
  };

  http.createServer(function(req, resp) {
    if (req.url.substring(0, 9) === '/get?url=') {
      if (req.method === 'GET') {
        var imageUrl = urlHelper.parse(req.url, true);
        if(imageUrl.query.url === '') {
          resp.writeHead(200, { 'Content-Type': 'text/plain' });
          resp.end('EMPTY');
          return;
        }

        var options = { url: safeDecodeURIComponent(imageUrl.query.url),
                        proxy: getSetting('proxy'),
                        headers: { 'User-Agent': useragent } };

        request(options).pipe(resp);
      }
    }
  }).listen(getSetting('local-proxy-port'));

  if (getSetting('proxy') === '') {
    $('#no-proxy-warning').removeClass('hidden');
  }

  // We need to reset the age and gender otherwise we're left with
  // stale data.
  $('#age-gender-modal').on('hidden.bs.modal', function () {
      $('#age').html('<i>Waiting...</i>');
      $('#gender').html('<i>Waiting...</i>');
  });

  $('a[href="#settings"]').click(function() {
    $('#' + getSetting('deletion')).prop('checked', true);
    $('#http-proxy').val(getSetting('proxy'));
    $('#local-proxy-port').val(getSetting('local-proxy-port'));
    $('#settings-modal').modal('show');
    return false;
  });

  $('a[href="#top"]').click(function() {
    $('html, body').animate({ scrollTop: 0 }, 'slow');
    return false;
  });

  $('#eor').click(function() {
    $('html, body').animate({ scrollTop: 100 }, 'slow');
    return false;
  });

  $('#save-settings').click(function() {

    if($('#http-proxy').val() !== '' && $('#local-proxy-port').val() === '') {
      alert('You must specify an unused local port to use a proxy.');
      return false;
    }

    if($('#local-proxy-port').val() !== getSetting('local-proxy-port')) {
      alert('You must restart Open Source Media for these changes to take ' +
            'effect.');
    }

    if($('#keep-images').is(':checked')) {
      saveSetting('deletion', 'keep-images');
    } else if($('#delete-images').is(':checked')) {
      saveSetting('deletion', 'delete-images');
    } else if($('#shred-images').is(':checked')) {
      saveSetting('deletion', 'shred-images');
    }

    saveSetting('local-proxy-port', $('#local-proxy-port').val());

    saveSetting('proxy', $('#http-proxy').val());

    if (getSetting('proxy') === '') {
      $('#no-proxy-warning').removeClass('hidden');
    } else {
      $('#no-proxy-warning').addClass('hidden');
    }

    $('#settings-modal').modal('hide');
  });

  $('a[href="#help"]').click(function() {
    gui.Shell.openExternal('http://git.io/B-r8LA');
  });

  $('#search-form').on('submit', function() {
    $('#images').html('');
    imageSearch($('#query').val());
    return false;
  });

});
