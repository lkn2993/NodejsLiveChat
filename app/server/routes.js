
var CT = require('./modules/country-list');
var AM = require('./modules/account-manager');
var EM = require('./modules/email-dispatcher');

module.exports = function (app, io) {
    
    // main login page //
    var usernames = {};
    var numUsers = {};
    app.get('/', function (req, res) {
        // check if the user's credentials are saved in a cookie //
        if (req.cookies.user == undefined || req.cookies.pass == undefined) {
            res.render('login', { title: 'Hello - Please Login To Your Account' });
        } else {
            // attempt automatic login //
            AM.autoLogin(req.cookies.user, req.cookies.pass, function (o) {
                if (o != null) {
                    req.session.user = o;
                    res.redirect('/home/' + o.user);
                } else {
                    res.render('login', { title: 'Hello - Please Login To Your Account' });
                }
            });
        }
    });
    app.get('/home', function (req, res) {
        // check if the user's credentials are saved in a cookie //
        if (req.cookies.user == undefined || req.cookies.pass == undefined) {
            res.render('login', { title: 'Hello - Please Login To Your Account' });
        } else {
            // attempt automatic login //
            AM.autoLogin(req.cookies.user, req.cookies.pass, function (o) {
                if (o != null) {
                    req.session.user = o;
                    res.redirect('/home/' + o.user);
                } else {
                    res.render('login', { title: 'Hello - Please Login To Your Account' });
                }
            });
        }
    });
    app.post('/', function (req, res) {
        AM.manualLogin(req.body['user'], req.body['pass'], function (e, o) {
            if (!o) {
                res.status(400).send(e);
            } else {
                req.session.user = o;
                res.cookie('user', o.user, { maxAge: 900000 });
                res.cookie('pass', o.pass, { maxAge: 900000 });
                res.status(200).send(o);
            }
        });
    });
    
    // logged-in user homepage //
    
    app.get('/panel', function (req, res) {
        if (req.session.user == null) {
            // if user is not logged-in redirect back to login page //
            res.redirect('/');
        } else {
            res.render('panel', {
                title : 'Control Panel',
                countries : CT,
                udata : req.session.user
            });
        }
    });
    app.get('/logout', function (req, res) {
        if (req.cookies.user != undefined && req.cookies.pass != undefined) {
            res.clearCookie('user');
            res.clearCookie('pass');
            res.clearCookie('old');
            req.session.destroy(function (e) { res.redirect('/'); });
        }
    });
    app.post('/panel', function (req, res) {
        if (req.body['user'] != undefined) {
            AM.updateAccount({
                user 	: req.body['user'],
                name 	: req.body['name'],
                email 	: req.body['email'],
                pass	: req.body['pass'],
                country : req.body['country']
            }, function (e, o) {
                if (e) {
                    res.status(400).send('error-updating-account');
                } else {
                    req.session.user = o;
                    // update the user's login cookies if they exists //
                    if (req.cookies.user != undefined && req.cookies.pass != undefined) {
                        res.cookie('user', o.user, { maxAge: 900000 });
                        res.cookie('pass', o.pass, { maxAge: 900000 });
                    }
                    res.status(200).send('ok');
                }
            });
        } else if (req.body['logout'] == 'true') {
            res.clearCookie('user');
            res.clearCookie('pass');
            res.clearCookie('old');
            req.session.destroy(function (e) { res.status(200).send('ok'); });
        }
    });
    app.get('/home/:id', function (req, res) {
        if (req.session.user == null) {
            // if user is not logged-in redirect back to login page //
            res.redirect('/');
        } else {
            res.render('home');
        }
    });
    
    var chat = io.on('connection', function (socket) {
        var addedUser = false;
        
        // when the client emits 'new message', this listens and executes
        socket.on('new message', function (data) {
            // we tell the client to execute 'new message'
            AM.addMessage(socket.room, socket.username, data, function (e, o) {
                if (o) {
                    socket.broadcast.to(socket.room).emit('new message', {
                        username: socket.username,
                        message: data
                    });
                } else {
                    console.log('unable to complete action');
                }
            });
        });
        
        // when the client emits 'add user', this listens and executes
        socket.on('add user', function (data) {
            var room = findClientsSocket(io, data.id);
            // we store the username in the socket session for this client
            socket.username = data.username;
            socket.room = data.id;
            // add the client's username to the global list
            usernames[socket.username] = socket.username;
            if (numUsers[socket.room] == null) {
                numUsers[socket.room] = 1;
            } else {
                ++numUsers[socket.room];
            }
            addedUser = true;
            socket.join(socket.room);
            AM.getMessages(socket.room , function (e, messagelist) {
                if (messagelist != null) {
                    var messages = messagelist.split('\r\n');
                    messages.forEach(function (message) {
                        var body = message.split(':');
                        socket.emit('new message', {
                            username: body[0],
                            message: body[1]
                        });
                    });
                }
            });
            socket.emit('login', {
                numUsers: numUsers[socket.room]
            });
            // echo globally (all clients) that a person has connected
            socket.broadcast.to(socket.room).emit('user joined', {
                username: socket.username,
                numUsers: numUsers[socket.room]
            });
        });
        socket.on('add friend', function (data) {
            AM.addNewFriend(data.user, data.friend, function (e, o) {
                if (o) {
                    console.log('add friend ok');
                } else {
                    console.log('unable to complete action');
                }
            })
        });
        // when the client emits 'typing', we broadcast it to others
        socket.on('typing', function () {
            socket.broadcast.to(socket.room).emit('typing', {
                username: socket.username
            });
        });
        
        // when the client emits 'stop typing', we broadcast it to others
        socket.on('stop typing', function () {
            socket.broadcast.to(socket.room).emit('stop typing', {
                username: socket.username
            });
        });
        
        // when the user disconnects.. perform this
        socket.on('disconnect', function () {
            // remove the username from global usernames list
            if (addedUser) {
                delete usernames[socket.username];
                --numUsers[socket.room];
                
                // echo globally that this client has left
                socket.broadcast.to(socket.room).emit('user left', {
                    username: socket.username,
                    numUsers: numUsers[socket.room]
                });
            }
        });
        socket.on('sign out', function (data) {
            // echo globally that this client has left
            AM.getFriends(data.user, function (e, friendlist) {
                if (friendlist != null) {
                    friends = Object.keys(friendlist);
                    friends.forEach(function (friend) {
                        socket.broadcast.to(friend).emit('user offline', {
                            username: data.user,
                        });
                    });
                }
            });
        });
        socket.on('sign in', function (data) {
            AM.getFriends(data.user, function (e, friendlist) {
                if (friendlist != null) {
                    friends = Object.keys(friendlist);
                    friends.forEach(function (friend) {
                        socket.broadcast.to(friend).emit('user online', {
                            username: data.user,
                        });
                    });
                }
            });
            // echo globally (all clients) that a person has connected
        });
    });

// creating new accounts //
	
	app.get('/signup', function(req, res) {
		res.render('signup', {  title: 'Signup', countries : CT });
	});
	
	app.post('/signup', function(req, res){
		AM.addNewAccount({
			name 	: req.body['name'],
			email 	: req.body['email'],
			user 	: req.body['user'],
			pass	: req.body['pass'],
			country : req.body['country']
		}, function(e){
			if (e){
				res.status(400).send(e);
			}	else{
				res.status(200).send('ok');
			}
		});
	});

// password reset //

	app.post('/lost-password', function(req, res){
	// look up the user's account via their email //
		AM.getAccountByEmail(req.body['email'], function(o){
			if (o){
				EM.dispatchResetPasswordLink(o, function(e, m){
				// this callback takes a moment to return //
				// TODO add an ajax loader to give user feedback //
					if (!e){
						res.status(200).send('ok');
					}	else{
						for (k in e) console.log('ERROR : ', k, e[k]);
						res.status(400).send('unable to dispatch password reset');
					}
				});
			}	else{
				res.status(400).send('email-not-found');
			}
		});
	});

	app.get('/reset-password', function(req, res) {
		var email = req.query["e"];
		var passH = req.query["p"];
		AM.validateResetLink(email, passH, function(e){
			if (e != 'ok'){
				res.redirect('/');
			} else{
	// save the user's email in a session instead of sending to the client //
				req.session.reset = { email:email, passHash:passH };
				res.render('reset', { title : 'Reset Password' });
			}
		})
	});
	
	app.post('/reset-password', function(req, res) {
		var nPass = req.body['pass'];
	// retrieve the user's email from the session to lookup their account and reset password //
		var email = req.session.reset.email;
	// destory the session immediately after retrieving the stored email //
		req.session.destroy();
		AM.updatePassword(email, nPass, function(e, o){
			if (o){
				res.status(200).send('ok');
			}	else{
				res.status(400).send('unable to update password');
			}
		})
	});
	
// view & delete accounts //
	
	app.get('/print', function(req, res) {
		AM.getAllRecords( function(e, accounts){
			res.render('print', { title : 'Account List', accts : accounts });
		})
	});
	
	app.post('/delete', function(req, res){
		AM.deleteAccount(req.body.id, function(e, obj){
			if (!e){
				res.clearCookie('user');
				res.clearCookie('pass');
				req.session.destroy(function(e){ res.status(200).send('ok'); });
			}	else{
				res.status(400).send('record not found');
			}
	    });
	});
	
	app.get('/reset', function(req, res) {
		AM.delAllRecords(function(){
			res.redirect('/print');	
		});
	});
	
	app.get('*', function(req, res) { res.render('404', { title: 'Page Not Found'}); });

};

function findClientsSocket(io, roomId, namespace) {
    var res = [],
        ns = io.of(namespace || "/");    // the default namespace is "/"
    
    if (ns) {
        for (var id in ns.connected) {
            if (roomId) {
                var index = ns.connected[id].rooms.indexOf(roomId);
                if (index !== -1) {
                    res.push(ns.connected[id]);
                }
            }
            else {
                res.push(ns.connected[id]);
            }
        }
    }
    return res;
}