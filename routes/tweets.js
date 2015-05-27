'use strict';

var express = require('express');
var router = express.Router();

var async = require('async');

var validate = require('../lib/middleware/validate');

var Tweet = require('../lib/model/tweet');
var User = require('../lib/model/user');

var stats = require('../lib/helper/stats');
var paginate = require('../lib/helper/paginate');
var join = require('../lib/helper/join');
var format = require('../lib/helper/format');

router.post('/',
  validate.required('tweet[text]'),
  validate.lengthLessThanOrEqualTo('tweet[text]', 140),
  function(req, res, next) {
    var loginUser = res.locals.loginUser;
    if (!loginUser) {
      return res.redirect('login');
    }

    var date = new Date();
    var timestamp = date.getTime();

    var tweet = new Tweet({
      text: req.body.tweet.text,
      created_at: timestamp,
      user_id: loginUser.id
    });

    tweet.save(function(err, tweet) {
      if (err) {
        return next(err);
      }

      User.listFollowerIds(loginUser.id, function(err, followerIds) {
        if (err) {
          return next(err);
        }

        async.each(followerIds, function(followerId, fn) {
          Tweet.addToHomeTimeline(tweet.id, followerId, timestamp, fn);
        }, function(err) {
          if (err) {
            return next(err);
          }

          if (req.remoteUser) {
            res.json({ message: 'Tweet added.' });
          } else {
            res.redirect('/');
          }
        });
      });
    });
  }
);

router.post('/:id', function(req, res, next) {
  var loginUser = res.locals.loginUser;
  if (!loginUser) {
    return res.redirect('/login');
  }

  if (req.body._method !== 'delete') {
    return res.redirect('/login');
  }

  var tweetId = req.params.id;

  Tweet.removeFromGlobalTimeline(tweetId, function(err) {
    if (err) {
      return next(err);
    }

    Tweet.removeFromUserTimeline(tweetId, loginUser.id, function(err) {
      if (err) {
        return next(err);
      }

      Tweet.removeFromHomeTimeline(tweetId, loginUser.id, function(err) {
        if (err) {
          return next(err);
        }

        User.listFollowerIds(loginUser.id, function(err, followerIds) {
          if (err) {
            return next(err);
          }

          async.each(followerIds, function(followerId, fn) {
            Tweet.removeFromHomeTimeline(tweetId, followerId, fn);
          }, function(err) {
            if (err) {
              return next(err);
            }

            Tweet.delete(tweetId, function(err) {
              if (err) {
                return next(err);
              }

              res.redirect('/');
            });
          });
        });
      });
    });
  });
});

module.exports = router;