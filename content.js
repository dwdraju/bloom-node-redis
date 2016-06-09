var
  async         =   require('async'),
  Bloom         =   require('bloom-redis'),
  express       =   require('express'),
  redis         =   require('redis'),
   
  app,
  client,
  filter,
   
  // From Project Gutenberg - opening lines of the top 10 public domain ebooks
  // https://www.gutenberg.org/browse/scores/top
  openingLines = {
    'pride-and-prejudice' : 
      'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
    'alices-adventures-in-wonderland' : 
      'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, \'and what is the use of a book,\' thought Alice \'without pictures or conversations?\'',
    'a-christmas-carol' :
      'Marley was dead: to begin with.',
    'metamorphosis' : 
      'One morning, when Gregor Samsa woke from troubled dreams, he found himself transformed in his bed into a horrible vermin.',
    'frankenstein'  : 
      'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings.',
    'adventures-of-huckleberry-finn' : 
      'YOU don\'t know about me without you have read a book by the name of The Adventures of Tom Sawyer; but that ain\'t no matter.',
    'adventures-of-sherlock-holmes' :
      'To Sherlock Holmes she is always the woman.',
    'narrative-of-the-life-of-frederick-douglass' :
      'I was born in Tuckahoe, near Hillsborough, and about twelve miles from Easton, in Talbot county, Maryland.',
    'the-prince' :
      'All states, all powers, that have held and hold rule over men have been and are either republics or principalities.',
    'adventures-of-tom-sawyer' :
      'TOM!'
  };
 
 
app = express();
client = redis.createClient();
 
filter = new Bloom.BloomFilter({ 
  client    : client,
  key       : '3content-bloom-filter', //the Redis key
  size      : 2875518, // ~350kb
  //size      : 1024,
  numHashes : 20
});
 
app.get('/show-content/:user', function(req,res,next) {
  //we're going to be looping through the contentIds, checking to see if they are in the filter.
  //Since this spends time on each contentId wouldn't be advisable to do over a high number of contentIds
  //But, in this case the number of contentIds is small / fixed and our filter.contains function is fast, it is okay.
  var
    //creates an array of the keys defined in openingLines
    contentIds = Object.keys(openingLines),
    //getting part of the path from the URI
    user = req.params.user,
    checkingContentId,
    found = false,
    done = false;
    
  //since filter.contains is asynchronous, we're using the async library to do our looping 
  async.whilst(
    //check function, where our asynchronous loop will end
    function () { return (!found && !done); },
    function(cb) {
      //get the first item from the array of contentIds
      checkingContentId = contentIds.shift();
       
      //false means we're sure that it isn't in the filter
      if (!checkingContentId)  {
         done = true; // this will be caught by the check function above
         cb();
      } else {
        //concatenate the user (from the URL) with the id of the content
        filter.contains(user+checkingContentId, function(err, results) {
          if (err) { cb(err); } else {
            found = !results;
            cb();
          }
        });
      }
    },
    function(err) {
      if (err) { next(err); } else {
        if (openingLines[checkingContentId]) {
          //before we send the fresh contentId, let's add it to the filter to prevent it from showing again
          filter.add(
            user+checkingContentId, 
            function(err) {
              if (err) { next(err); } else {
                //send the fresh quote
                res.send(openingLines[checkingContentId]);
              }
            }
          );
        } else {
          res.send('no new content!');
        }
      }
    }
  );
});
 
app.listen(8011);