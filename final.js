var
  async           =   require('async'),
  Bloom           =   require('bloom-redis'),
  bodyParser      =   require('body-parser'),
  express         =   require('express'),
  redis           =   require('redis'),
   
  app,
  client,
  filter,
   
  currentDataKey  = 'current-data',
  usedDataKey     = 'used-data';
   
app = express();
client = redis.createClient();
 
filter = new Bloom.BloomFilter({ 
  client    : client,
  key       : 'stale-bloom-filter',
  //for illustration purposes, this is a super small filter. It should fill up at around 500 items, so for a production load, you'd need something much larger!
  size      : 1024,
  numHashes : 20
});
 
app.post(
  '/',
  bodyParser.text(),
  function(req,res,next) {
    var
      used;
       
    console.log('POST -', req.body); //log the current data being posted
    console.time('post'); //start measuring the time it takes to complete our filter and conditional verification process
     
    //async.series is used to manage multiple asynchronous function calls.
    async.series([
      function(cb) {
        filter.contains(req.body, function(err,filterStatus) {
          if (err) { cb(err); } else {
            used = filterStatus;
            cb(err);
          }
        });
      },
      function(cb) {
        if (used === false) {
          //Bloom filters do not have false negatives, so we need no further verification
          cb(null);
        } else {
          //it *may* be in the filter, so we need to do a follow up check
          //for the purposes of the tutorial, we'll add a 150ms delay in here since Redis can be fast enough to make it difficult to measure and the delay will simulate a slow database or API call
          setTimeout(function() {
            console.log('possible false positive');
            client.sismember(usedDataKey, req.body, function(err, membership) {
              if (err) { cb(err); } else {
                //sismember returns 0 if an member is not part of the set and 1 if it is.
                //This transforms those results into booleans for consistent logic comparison
                used = membership === 0 ? false : true;
                cb(err);
              }
            });
          }, 150);
        }
      },
      function(cb) {
        if (used === false) {
          console.log('Adding to filter');
          filter.add(req.body,cb);
        } else {
          console.log('Skipped filter addition, [false] positive');
          cb(null);
        }
      },
      function(cb) {
        if (used === false) {
          client.multi()
            .set(currentDataKey,req.body) //unused data is set for easy access to the 'current-data' key
            .sadd(usedDataKey,req.body) //and added to a set for easy verification later
            .exec(cb); 
        } else {
          cb(null);
        }
      }
      ],
      function(err, cb) {
        if (err) { next(err); } else {
          console.timeEnd('post'); //logs the amount of time since the console.time call above
          res.send({ saved : !used }); //returns if the item was saved, true for fresh data, false for stale data.
        }
      }
    );
});
 
app.get('/',function(req,res,next) {
  //just return the fresh data
  client.get(currentDataKey, function(err,data) {
    if (err) { next(err); } else {
      res.send(data);
    }
  });
});
 
app.listen(8012);