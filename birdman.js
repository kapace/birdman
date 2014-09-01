$(function(){

	var Tweet = Backbone.Model.extend({
		parse: function (response, options) {
			response.text = this.replaceEntities (response.retweeted_status || response);
			if (response.retweeted_status) response.text = "RT: " + response.text
			return  response;
		},

		// Replace plain text in tweet with URLs to entities (URLs, usernames, hashtags).
		replaceEntities: function (tweet) {
			// preprocess: replace all emoji with a single byte so .indices are correct for substring()
			var emojis = [];

			var ranges = [
				'\ud83c[\udf00-\udfff]', // U+1F300 to U+1F3FF
				'\ud83d[\udc00-\ude4f]', // U+1F400 to U+1F64F
				'\ud83d[\ude80-\udeff]'  // U+1F680 to U+1F6FF
			];

			tweet.text = tweet.text.replace(new RegExp(ranges.join('|'), 'g'),  function(match, offset, string){
				emojis.push({
					offset: offset,
					char: match
				});
				return '\u0091';
			});

			// Collect entity replacements by mapping entities to replacement object
			replacements = _.map(tweet.entities.urls, function (url) {
				return { indices : url.indices, 
					 replacement : "<a href='"+url.expanded_url+"'>"+url.display_url+"</a>"};
			});

			replacements.push.apply(replacements,_.map(tweet.entities.media, function (url) {
				return { indices : url.indices, 
					 replacement : "<a href='"+url.expanded_url+"'>"+url.display_url+"</a>"};
			}));

			replacements.push.apply(replacements,_.map(tweet.entities.user_mentions, function (user){
				return { indices: user.indices,
					 replacement: "<a href='http://twitter.com/"+ user.screen_name+"'>@" + user.screen_name + "</a>"};
			}));

			replacements.push.apply(replacements,_.map(tweet.entities.hashtags, function (hash){
				return { indices: hash.indices,
					 replacement: "<a href='http://twitter.com/hashtag/"+ hash.text+"'>#" + hash.text + "</a>"};
			}));

			// Sort by last index values first so that replacements don't invalidate indices.
			replacements.sort(function (a, b){
				return b.indices[0] - a.indices[0];
			});

			// Now we can make our replacements.
			_.each(replacements, function (replacement) {
				tweet.text = tweet.text.substring(0, replacement.indices[0]) + 
						replacement.replacement + tweet.text.substring(replacement.indices[1]);
			})

			// Restore single character placeholders with original emoji
			tweet.text = tweet.text.replace(/\u0091/g, function(match, offset, string){
				emoji = emojis.shift();
				return '<span class="emoji" data-emoji="u'+emoji.char.charCodeAt(0)+'">'+emoji.char+'</span>'
			});

			return tweet.text;
		},
		defaults: function() {
			return {
				retweeted_status: "" 
			}
		}
	});

	var TweetList = Backbone.Collection.extend({
		model: Tweet,
		url : "",

		initialize: function(model, option) {
			this.queryHost = "http://netlift.ca/birdman/birdman-proxy.php";
			this.loading_template = _.template($("#load-template").html());
		},

		parse: function (resp, xhr) {
			// Don't attempt to parse if the call returned an error.
			if (resp.errors != undefined) {
				$('#loading').text("Error occurred searching twitter.");
				return;
			} else {
				$('#loading').html(this.loading_template())
						.fadeTo( 1000, 0 ); // make element invisible, but don't apply display:none
			}

			this.url = this.queryHost + resp.search_metadata.refresh_url;
			resp.statuses.reverse(); // reverse statuses array to push newest tweets to the top.

			return resp.statuses;
		},

		// Set the query for the twitter search, store it in localStorage.
		setQuery: function ( val ) {
			if ( val == "" ) return;

			// show loading gif.
			$("#loading").fadeTo( 1000, 1 );

			var lastquery = localStorage.getItem("lastquery");
			
			// If the last query has changed, or if the url hasn't been set yet: set the url.
			if ( lastquery != val || this.url == "") {
				this.url = this.queryHost + "?q=" + val;

				localStorage.setItem("lastquery", val);
			}

			this.fetch({ reset: (lastquery != val),
				error :  function (collection, response, options) {
					$('#loading').text("Error occurred searching twitter.");
				}
			});
		}
	});
	
	var Tweets = new TweetList;
	
	var TweetView = Backbone.View.extend({
		tagName: "div",
		template: _.template($("#tweet-template").html()),
		events : {
		},
		
		initialize: function () {
			this.listenTo(this.model, 'change', this.render);
			this.listenTo(this.model.collection, 'sync', this.render); // render when collection sync to update timestamps
			this.listenTo(this.model, 'destroy', this.remove);
		},
		
		render: function () {
			this.$el.html(this.template(this.model.toJSON()));
			return this;
		}
	});
	
	
	var BirdmanView = Backbone.View.extend({
		el: $("#birdmanapp"),
		
		initialize: function() {

			this.listenTo(Tweets, 'add', this.addOne);
			this.listenTo(Tweets, 'reset', this.addAll);
			this.listenTo(Tweets, 'all', this.render);
			
			var lastquery = localStorage.getItem("lastquery");

			if (lastquery) {
				$("#query").val(lastquery);
				Tweets.setQuery(lastquery);
			} else {
				$('#loading').fadeTo( 1000, 0 );
			}
		},
		
		render: function() {
		},
		
		addOne: function(tweet) {
			var view = new TweetView({model: tweet});
			this.$("#tweet-list").prepend(view.render().el);
		},

		// Clear the tweet list html and add all items in the Tweets collection at once.
		addAll: function() {
			this.$("#tweet-list").html('');
			Tweets.each(this.addOne, this);
		}
	});
	
	var App = new BirdmanView;

	$("#search").click (function () {
		Tweets.setQuery($("#query").val());
	});

	$('input#query').keypress(function (e) {
		if (e.which == 13) {
			Tweets.setQuery($("#query").val());
			return false;
		}
	})

	setInterval(function (){
		Tweets.setQuery(localStorage.getItem("lastquery") || "");
	}, 10000)
});

function formatCreateDate (cdate) {
	cdate = new Date (Date.parse(cdate.replace(/( \+)/, ' UTC$1')));
	var millis = new Date() - cdate;

	if (millis < 60000)
		return Math.round( millis / 1000 ) + "s";
	else if (millis >= 60000 && millis < 3600000)
		return Math.round( millis / 1000 / 60 ) + "m";
	else if (millis >= 3600000 && millis < 86400000)
		return Math.round( millis / 1000 / 60 / 60 ) + "h";
	else return {
			"0": "Jan",
			"1": "Feb",
			"2": "Mar",
			"3": "Apr",
			"4": "May",
			"5": "Jun",
			"6": "Jul",
			"7": "Aug",
			"8": "Sept",
			"9": "Oct",
			"10": "Nov",
			"11": "Dec"
		}[cdate.getMonth()] + " " + cdate.getDate();
}
