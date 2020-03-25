const db = require('./queries')
const authController = require('./controllers/auth');
const userController = require('./controllers/user');
const eventController = require('./controllers/event');
const evenUserController = require('./controllers/event_user');
const speakerController = require('./controllers/speaker');

module.exports.set = app => {
  app.post('/login', authController.login);
  app.post('/register', authController.register);

  // app.get('/usuarios', db.getUsers);
  app.put('/usuarios/:id', userController.updateUser);

  app.get('/events', db.getEvents);
  app.get('/event/:id', eventController.getEventId);
  app.post('/event', eventController.newEvent);
  app.put('/event/:id', eventController.updateEvent);
  app.delete('/event/:id', eventController.deleteEvent);

  app.get('/event_user/:id', db.getEventUser);
  app.post('/event_user', evenUserController.newEventUser);
  app.delete('/event_user/:event_id/:user_id', db.deleteEventUser);

  app.get('/speakers', speakerController.getSpeakers);
  app.post('/speaker', speakerController.newSpeaker);
}
