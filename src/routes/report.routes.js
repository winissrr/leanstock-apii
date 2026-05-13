const { Router } = require('express');
const c = require('../controllers/reportController');
const authMw = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const tenantScope = require('../middleware/tenantScope');

const r = Router();
r.use(authMw, tenantScope, rbac('ADMIN', 'MANAGER'));
r.get('/valuation', c.valuation);
module.exports = r;
