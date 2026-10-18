'use strict';
const router = require('express').Router();
const home = require('../controllers/home.controller');

router.get('/', home.home);
router.get('/browse', home.browse);
router.get('/about', home.about);
router.get('/lang/:code', home.setLang);

module.exports = router;
