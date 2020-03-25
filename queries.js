const Pool = require('pg').Pool
const pool = new Pool({
  user: 'yovanamata',
  host: '127.0.0.1',
  database: 'challenge',
  password: '123456',
  port: 5432,
});

const getEvents = (request, response) => {
  pool.query('SELECT * FROM events AS e ORDER BY e.id DESC', (err, results) => {
    if (err) {
      throw err
    }
    const itemsPage = Math.ceil(results.rows.length / 10);
    const total = itemsPage;
    const display = (itemsPage < 5) ? itemsPage : 5;
    const lastDate = parseInt(10) * parseInt(1);
    const firstDate = parseInt(lastDate) * parseInt(1 - 1) / 1;
    const currentRes = {
      events: results.rows.slice(firstDate, lastDate),
      itemsPagination: results.rows,
      total,
      display
    };
    response.status(200).json(currentRes);
  });
};

const getEventUser = (request, response) => {
  const userId = request.params.id;
  pool.query('SELECT * FROM events_users AS eu WHERE user_id=$1', [userId], (err, results) => {
    if (err) {
      throw err
    }
    response.status(200).json(results.rows);
  });
};

const deleteEventUser = (request, response) => {
  const userId = request.params.user_id;
  const eventId = request.params.event_id;
  pool.query('DELETE FROM events_users WHERE user_id=$1 AND event_id=$2', [userId, eventId], (err, results) => {
    if (err) {
      throw err
    }
    response.status(201).send(`Eliminado correctamente.`)
  });
};

module.exports = {
  getEvents,
  getEventUser,
  deleteEventUser,
}