var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var passport = require('passport');
var expressSession = require('express-session');
var bodyParser = require("body-parser");

var FacebookStrategy = require('passport-facebook').Strategy;
var FACEBOOK_APP_ID = '1703739433196596';
var FACEBOOK_APP_SECRET = '473ca965ba2a64bc03752c6c725a1219';

var path = require('path');

var whoIsTyping = new Array();
var activeUsers = new Array();

// express session to pass into the socket
var sessionMiddleware = expressSession({
    name: "test_cookie",
    secret: "test_cookie_secret",
    resave: true,
    saveUninitialized: true
});

app.use(sessionMiddleware);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));


app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));


passport.use(new FacebookStrategy({
  clientID: FACEBOOK_APP_ID,
  clientSecret: FACEBOOK_APP_SECRET,
  callbackURL: 'http://localhost:3000/auth/facebook/callback',
  profileFields: ['id', 'displayName', 'gender', 'locale', 'email', 'link', 'photos']
}, function(accessToken, refreshToken, profile, done) {
  process.nextTick(function() {
    done(null, profile);
  });
}));

//serializing user changes the format for transport
passport.serializeUser(function(user, done) {
  done(null, user);
});
//profile object coming back
passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


//this route doesn't end in a visible thing, it is a middle-man, and has to occur before things can happen
app.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email']})); //whatever you are using to authenticate

//this is where the redirection happens
app.get('/auth/facebook/callback', passport.authenticate('facebook', {
//end point of authentication, if successful go somewhere, if unsuccessful go somewhere else
  successRedirect: '/chat',
  failureRedirect: '/'
}));

// when the route is '/'
// req.user created from the passport session that comes back with the facebook auth. 
// If there is no user object in the req, go to the login page
// otherwise (there is a user), go to the chat page 
app.get('/', function(req, res, next) {
  if (!req.user) {
    res.sendFile(__dirname + '/auth.html');
  }
  else {
    res.redirect('/chat');
  }
});

// when the route is '/chat'
// req.user created from the passport session that comes back with the facebook auth. 
// If there is no user object in the req, redirect to the '/' route
// otherwise, load the chat page
app.get('/chat', function(req, res, next) {
  if(!req.user) {
    res.redirect('/');
  }
  else {
  res.sendFile(__dirname + '/index.html');
  }
});


io.use(function(socket, next){
        // Put the express session middleware into the the socket
        sessionMiddleware(socket.request, {}, next);
  })
  .on('connection', function(socket){
  console.log('connection event has happened');

  // set the socket.username variable to the facebook display name, available because socket.request
  // was passed into the io.use in the sessionMiddleware
  // set the photo to be the first in the array
  // set the link to the profile based on user data
  socket.username=socket.request.session.passport.user.displayName;
  socket.userphoto='<img src="'+socket.request.session.passport.user.photos[0].value+'">';
  socket.userLink = socket.request.session.passport.user.profileUrl;
  // console.log(socket.request.session.passport.user);

  // push an object containing user data into the activeUsers array
  // update the active users and change the welcome message on the page to greet the user
  activeUsers.push({username: socket.username, photo: socket.userphoto, link: socket.userLink});
  io.emit('update active users', activeUsers);
  io.emit('welcome message', socket.username);


  //event comes in when user connects or disconnects
  // emit the event, passing in the array of active users

  socket.on('update active users', function(e) {
    io.emit('update active users', activeUsers);
  });

  // event comes in when user starts typing
  // if the username does not already exist in the array of people currently typing
  // push the username to the array

  socket.on('send username to array', function(e){
    if(whoIsTyping.indexOf(socket.username)==-1) {
      whoIsTyping.push(socket.username);
    }
  });


  // when a user is typing event comes in
  // emit the event back, passing in the array of who is typing

  socket.on('user typing', function(e){
    io.emit('user typing', whoIsTyping);
  });

  // when the not typing event comes in
  // find where the username is in the array of people typing
  // delete the username from the array
  // emit the not typing event back, passing it the updated array

  socket.on('not typing', function(e){
    var index = whoIsTyping.indexOf(socket.username);
    whoIsTyping.splice(index, 1);
    io.emit('user typing', whoIsTyping);
  });



  // when a chat message event comes in with parameter
  // add the username of this socket instance
  // emit the event back out

  socket.on('chat message', function(msg){
  	io.emit('chat message', socket.userphoto+'<span class="name">'+socket.username+':</span> '+msg);
  });

  // when the disconnect event comes in, emit the event back
  // pass the username variable of this socket with a string
  // remove the username from the array of active users

  socket.on('disconnect', function(){
    var index = whoIsTyping.indexOf(socket.username);
    if(index!=-1) {
      whoIsTyping.splice(index, 1);
    }
    io.emit('user typing', whoIsTyping);
    if(socket.username) {
    io.emit('chat message', '<span class="connectionCheck">'+socket.username +' has disconnected</span>');
    }
    var active = activeUsers.indexOf(socket.username);
    activeUsers.splice(active, 1);
    io.emit('update active users', activeUsers);
  });

});


http.listen(3000, function(){
  console.log('listening on port 3000');
});