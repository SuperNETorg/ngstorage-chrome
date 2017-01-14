(function (root, factory) {
  'use strict';

  if (typeof define === 'function' && define.amd) {
    define(['angular'], factory);
  } else if (root.hasOwnProperty('angular')) {
    // Browser globals (root is window), we don't register it.
    factory(root.angular);
  } else if (typeof exports === 'object') {
    module.exports = factory(require('angular'));
  }
}(this, function (angular) {
    'use strict';

    // In cases where Angular does not get passed or angular is a truthy value
    // but misses .module we can fall back to using window.
    angular = (angular && angular.module) ? angular : window.angular;

    /**
     * @ngdoc overview
     * @name ngStorage
     */

    return angular.module('ngStorage', [])

    /**
     * @ngdoc object
     * @name ngStorage.$localStorage
     * @requires $rootScope
     * @requires $window
     */

    .provider('$localStorage', _storageProvider('localStorage'))

    /**
     * @ngdoc object
     * @name ngStorage.$sessionStorage
     * @requires $rootScope
     * @requires $window
     */

    .provider('$sessionStorage', _storageProvider('sessionStorage'));

    function _storageProvider(storageType) {
        return function () {
          var storageKeyPrefix = 'ngStorage-';

          this.setKeyPrefix = function (prefix) {
            if (typeof prefix !== 'string') {
              throw new TypeError('[ngStorage] - ' + storageType + 'Provider.setKeyPrefix() expects a String.');
            }
            storageKeyPrefix = prefix;
          };

          var serializer = angular.toJson,
              deserializer = angular.fromJson,
              isChromeApp = false;

          // chrome app env check
          if (chrome)
            try {
              chrome.storage.local.set({ 'ngStorageTestVal': 'it is working' });
              isChromeApp = true;
            }
            catch (err) {}

          this.setSerializer = function (s) {
            if (typeof s !== 'function') {
              throw new TypeError('[ngStorage] - ' + storageType + 'Provider.setSerializer expects a function.');
            }

            serializer = s;
          };

          this.setDeserializer = function (d) {
            if (typeof d !== 'function') {
              throw new TypeError('[ngStorage] - ' + storageType + 'Provider.setDeserializer expects a function.');
            }

            deserializer = d;
          };

          // Note: This is not very elegant at all.
          this.get = function (key) {
            if (isChromeApp) {
              chrome.storage.local.get(storageKeyPrefix + key, function(result) {
                return deserializer(result);
              });
            } else {
              return deserializer(window[storageType].getItem(storageKeyPrefix + key));
            }
          };

          // Note: This is not very elegant at all.
          this.set = function (key, value) {
            if (isChromeApp) {
              var _obj = {};
              _obj[storageKeyPrefix + key] = serializer(value);
              return chrome.storage.local.set(_obj);
            } else {
              return window[storageType].setItem(storageKeyPrefix + key, serializer(value));
            }
          };

          this.$get = [
              '$rootScope',
              '$window',
              '$log',
              '$timeout',
              '$document',

              function(
                  $rootScope,
                  $window,
                  $log,
                  $timeout,
                  $document
              ){
                function isStorageSupported(storageType) {

                    // Some installations of IE, for an unknown reason, throw "SCRIPT5: Error: Access is denied"
                    // when accessing window.localStorage. This happens before you try to do anything with it. Catch
                    // that error and allow execution to continue.

                    // fix 'SecurityError: DOM Exception 18' exception in Desktop Safari, Mobile Safari
                    // when "Block cookies": "Always block" is turned on
                    var supported;
                    try {
                        supported = $window[storageType];
                    }
                    catch (err) {
                        supported = false;
                    }

                    // When Safari (OS X or iOS) is in private browsing mode, it appears as though localStorage
                    // is available, but trying to call .setItem throws an exception below:
                    // "QUOTA_EXCEEDED_ERR: DOM Exception 22: An attempt was made to add something to storage that exceeded the quota."
                    if (supported && storageType === 'localStorage') {
                        var key = '__' + Math.round(Math.random() * 1e7);

                        try {
                            localStorage.setItem(key, key);
                            localStorage.removeItem(key);
                        }
                        catch (err) {
                            supported = false;
                        }
                    }

                    if (isChromeApp) {
                        supported = true;
                        console.log('switching to chrome storage');
                    }

                    return supported;
                }

                // The magic number 10 is used which only works for some keyPrefixes...
                // See https://github.com/gsklee/ngStorage/issues/137
                var prefixLength = storageKeyPrefix.length;

                // #9: Assign a placeholder object if Web Storage is unavailable to prevent breaking the entire AngularJS app
                var webStorage = isStorageSupported(storageType) || ($log.warn('This browser does not support Web Storage!'), {setItem: angular.noop, getItem: angular.noop, removeItem: angular.noop}),
                    $storage = {
                        $default: function(items) {
                            for (var k in items) {
                                angular.isDefined($storage[k]) || ($storage[k] = angular.copy(items[k]) );
                            }

                            $storage.$sync();
                            return $storage;
                        },
                        $reset: function(items) {
                            for (var k in $storage) {
                                if (isChromeApp) {
                                    var _obj = {};
                                    _obj[storageKeyPrefix + k] = null;
                                    '$' === k[0] || (delete $storage[k] && chrome.storage.local.set(_obj));
                                } else {
                                    '$' === k[0] || (delete $storage[k] && webStorage.removeItem(storageKeyPrefix + k));
                                }
                            }

                            return $storage.$default(items);
                        },
                        $sync: function () {
                            for (var i = 0, l = webStorage.length, k; i < l; i++) {
                                // #8, #10: `webStorage.key(i)` may be an empty string (or throw an exception in IE9 if `webStorage` is empty)
                                if (isChromeApp) {
                                    var returnedItem;
                                    chrome.storage.local.get(k, function(result) {
                                        returnedItem = result;
                                        (k = webStorage.key(i)) && storageKeyPrefix === k.slice(0, prefixLength) && ($storage[k.slice(prefixLength)] = deserializer(returnedItem));
                                    });
                                } else {
                                    (k = webStorage.key(i)) && storageKeyPrefix === k.slice(0, prefixLength) && ($storage[k.slice(prefixLength)] = deserializer(webStorage.getItem(k)));
                                }
                            }
                        },
                        $apply: function() {
                            var temp$storage;

                            _debounce = null;

                            if (!angular.equals($storage, _last$storage)) {
                                temp$storage = angular.copy(_last$storage);
                                angular.forEach($storage, function(v, k) {
                                    if (angular.isDefined(v) && '$' !== k[0]) {
                                        if (isChromeApp) {
                                            var _obj = {};
                                            _obj[storageKeyPrefix + k] = serializer(v);
                                            chrome.storage.local.set(_obj);
                                        } else {
                                            webStorage.setItem(storageKeyPrefix + k, serializer(v));
                                        }

                                        delete temp$storage[k];
                                    }
                                });

                                for (var k in temp$storage) {
                                    if (isChromeApp) {
                                        var _obj = {};
                                        _obj[storageKeyPrefix + k] = null;
                                        chrome.storage.local.set(_obj);
                                    } else {
                                        webStorage.removeItem(storageKeyPrefix + k);
                                    }
                                }

                                _last$storage = angular.copy($storage);
                            }
                        }
                    },
                    _last$storage,
                    _debounce;

                $storage.$sync();

                _last$storage = angular.copy($storage);

                $rootScope.$watch(function() {
                    _debounce || (_debounce = $timeout($storage.$apply, 100, false));
                });

                // #6: Use `$window.addEventListener` instead of `angular.element` to avoid the jQuery-specific `event.originalEvent`
                $window.addEventListener && $window.addEventListener('storage', function(event) {
                    if (!event.key) {
                      return;
                    }

                    // Reference doc.
                    var doc = $document[0];

                    if ( (!doc.hasFocus || !doc.hasFocus()) && storageKeyPrefix === event.key.slice(0, prefixLength) ) {
                        event.newValue ? $storage[event.key.slice(prefixLength)] = deserializer(event.newValue) : delete $storage[event.key.slice(prefixLength)];

                        _last$storage = angular.copy($storage);

                        $rootScope.$apply();
                    }
                });

                $window.addEventListener && $window.addEventListener('beforeunload', function() {
                    $storage.$apply();
                });

                return $storage;
              }
          ];
      };
    }

}));
