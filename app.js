var Bloom         =   require('bloom-redis'),
	express       =   require('express'),
	redis         =   require('redis'),
	app,
	client,
	filter;
app = express(); 
//create the connection to Redis
client = redis.createClient();
bloom.connect(client);
 
filter = new Bloom.BloomFilter({ 
  key       : 'username-bloom-filter', //the Redis key   
  size      : 5943695, //size of the Bloom filter ~725kb
  numHashes : 20
});
 
app.get('/check', function(req,res,next) {
  //check to make sure the query string has 'username'
  if (typeof req.query.username === 'undefined') {
    //skip this route, go to the next one - will result in a 404 / not found
    next('route');
  } else {
   filter.contains(
     req.query.username, // the username from the query string
     function(err, result) {
       if (err) { 
        next(err); //if an error is encountered, send it to the client
        } else {
          res.send({ 
            username : req.query.username, 
            //if the result is false, then we know the item has *not* been used
            //if the result is true, then we can assume that the item has been used
            status : result ? 'used' : 'free'
          });
        }
      }
    );
  }
});
 
 
app.get('/save',function(req,res,next) {
  if (typeof req.query.username === 'undefined') {
    next('route');
  } else {
    //first, we need to make sure that it's not yet in the filter
    filter.contains(req.query.username, function(err, result) {
      if (err) { next(err); } else {
        if (result) {
          //true result means it already exists, so tell the user
          res.send({ username : req.query.username, status : 'not-created' });
        } else {
          //we'll add the username passed in the query string to the filter
          filter.add(
            req.query.username, 
            function(err) {
              //The callback arguments to `add` provides no useful information, so we'll just check to make sure that no error was passed
              if (err) { next(err); } else {
                res.send({ 
                  username : req.query.username, status : 'created' 
                });
              }
            }
          );
        }
      }
    });
  }
});
 
app.listen(8080);