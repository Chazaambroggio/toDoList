require('dotenv').config();
const express = require("express");
const mongoose = require('mongoose');
const _ = require('lodash');
const session = require('express-session');
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");

const app = express();
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

app.use(session({
	secret: process.env.SESSION_SECRET_KEY,
	resave: false,
	saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// ########### MongoDB #################
mongoose.set('strictQuery',false);

 const mongoAtlasUser = process.env.MONGO_ATLAS_USERNAME;
 const mongoAtlasPassword = process.env.MONGO_ATLAS_PASSWORD;
const mongoConnection = "mongodb+srv://" + mongoAtlasUser+ ":" + mongoAtlasPassword+ "@cluster0.eieruug.mongodb.net/todoListDB";

mongoose.connect(mongoConnection, {useNewUrlParser: true});

//schema
const itemsSchema = {
	name: String
};

//model
const Item = mongoose.model("Item", itemsSchema);

//documents.
const item1 = new Item({
	name: "Welcome to your todoList!"
});
const item2 = new Item({
	name: "Hit the + button to add a new item."
});
const item3 = new Item({
	name: "<-- Hit this to delete an item."
});

const defaultItems = [item1, item2, item3];

const listSchema = {
	user_id: String,
	name: String,
	items: [itemsSchema]
};

const List = mongoose.model("List", listSchema);
// ##############################################



// ########### Login ############################ 
const userSchema = new mongoose.Schema ({
	email: String,
	password: String 
});

userSchema.plugin(passportLocalMongoose);

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.get("/register", function(req, res){
	res.render("register");
});

app.get("/login", function(req, res){
	res.render("login");
});


app.post('/logout', function(req, res, next){
	req.logout(function(err) {
	  if (err) { return next(err); }
	  res.redirect('/');
	});
  });

app.post("/register", function(req, res){

	if (req.body.password === req.body.confirmPassword){
		User.register({username: req.body.username}, req.body.password, function(err, user){
			if (err){
				console.log(err);
				res.redirect("/register");
			} else {
				passport.authenticate("local")(req, res, function(err){
					if (err){
						console.log(err)
					} else {
						console.log('Registration successful, redirecting to home...');
						res.redirect("/");
					}
				});
			}
		});
	} 


	
});

app.post("/login", function(req, res) {
		
	User.findOne({username: req.body.username}, function(err, foundUser){

		if (foundUser){
			const user = new User({
				username: req.body.username,
				password: req.body.password
			});

			passport.authenticate("local", {failureRedirect: "/login"})(req, res, function(err){
				if (err){
					console.log(err)
				} else {
					res.redirect("/");
				}
			});
		} else {
			// User not found. Redirect to registration page.
			res.redirect("/register");
		}
	});
});

// ##############################################


// ########### App ############################ 

app.get("/", function(req, res){
	

	if (!req.isAuthenticated()){
		res.redirect("/login");
	} else {

		// Getting all existing custom list names.
		const user_id = req.session.passport.user;
		const userLists = [];
		List.find({user_id: user_id}, function(err, foundlists){
			if (!err){
				foundlists.forEach(foundList => {
	
					userLists.push(foundList);
				});
			}
		})
	
		//Search for items in main list.
		Item.find({}, function(err, foundItems){
			if (foundItems.length === 0) {
				//Add default items to new list.
				Item.insertMany(defaultItems, function(err){
					if (err){
						console.log(err);
					} else{
						console.log('Default items loaded succesfully.');
					}
				});
				res.redirect("/");
			} else {
				
				//Do not add default items.
				res.render("list", { listTitle: "Today", listItems: foundItems, userLists: userLists, username: user_id});
			}
		});		

	}
});


app.post("/", function(req, res){
	
		// Redirect non authenthicated user to registration.
	if (!req.isAuthenticated()){
		res.redirect("/login");
	}
	const user_id = req.session.passport.user;

	let newItem = req.body.newItem;
	let listName = req.body.list;

	//Create new item document.
	const item = new Item({
		name: newItem
	});

	if (listName == "Today"){
		// Write item into db.
		item.save();
		res.redirect("/");
	} else{
		List.findOne({user_id, user_id, name: listName}, function(err, foundList){
			//Adding item into list.
			foundList.items.push(item);
			foundList.save();
			res.redirect("/lists/"+ listName);
		});
	}
});

app.get("/lists/:customListName", function(req, res){

	// Redirect non authenthicated user to registration.
	if (!req.isAuthenticated()){
		res.redirect("/login");
	}

	const user_id = req.session.passport.user;
	const userLists = [];

	// Getting all existing custom list names.
	List.find({user_id: user_id}, function(err, foundLists){
		if (!err){
			foundLists.forEach(foundList => {
				//Creating list of existing custom list.
				userLists.push(foundList);
			});
		}
	});
	
	//Formating name.
	const customListName = _.capitalize(req.params.customListName);

	// Check if list already exist.
	List.findOne({user_id: user_id, name: customListName}, function(err, foundList){
		if (!err){
			if (!foundList){
				//Create a new list.
				const list = new List({
					name: customListName,
					user_id: user_id,
					items: defaultItems
				});
				list.save();
				res.redirect("/lists/" + list.name);

			} else {
				// List already exist. Render page..
				res.render("list", { listTitle: foundList.name, listItems: foundList.items, userLists: userLists, username: user_id} );
			}
		}
	});
});

app.post("/add-custom-list", function(req, res){
	// Redirect to add new list.
	let listName = req.body.newList;

	res.redirect("/lists/" + listName);

});



// Delete using id? 
// just like item.
app.post("/delete", function(req, res){

	const itemId = req.body.checkbox;
	const listName = req.body.listName;

	if (listName == "Today"){
		//Delete item from Today list.
		Item.findByIdAndRemove(itemId, function(err){
			if (!err){
				console.log('Successfuly remove item.');
				res.redirect("/");
			} 
		});
	} else {
		//Delete item from custom list.
		List.findOneAndUpdate({name: listName}, {$pull: {items: {_id: itemId}}}, function(err, foundList){
			if (!err){
				res.redirect("/lists/" + listName);
			}
		});
	}
});


app.post("/delete-list", function(req, res){

	const listId = req.body.checkboxList;
	const listName = req.body.listName;

	// Remove list.
	List.findByIdAndRemove( listId, function(err, foundList){
		if (!err){
			console.log('Successfuly remove list.');

			if (listName === "Today"){
				res.redirect("/");
			} else if (listName != foundList.name){
				//Redirect to current list.
				res.redirect("/lists/"+ listName);
			} else {
				//Redirect to default list.
				res.redirect("/");
			}
		} 
	});
});

// ##############################################

app.listen(process.env.PORT || 3000, function() {
	console.log("Server started on port 3000");
}); 