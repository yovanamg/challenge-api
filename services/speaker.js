const Speakers = require('../models').Speaker;

const getAll = () => Speakers.findAll({
  order: [
    ['id', 'DESC']
  ],
}
);
const getById = id => Speakers.findById(id);
const add = speaker => Speakers.create(speaker);
const updateSpeaker = speaker => Speakers.update(speaker, { where: { id: speaker.id }});
const deleteSpeaker = id => Speakers.destroy({ where: { id: parseInt(id) } });
module.exports = { getAll, add, updateSpeaker, getById, deleteSpeaker };