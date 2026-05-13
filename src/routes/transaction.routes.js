const { Router } = require('express');
const c = require('../controllers/transactionController');
const authMw = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');

const r = Router();
r.use(authMw, tenantScope);
r.get('/', c.list);
module.exports = r;
