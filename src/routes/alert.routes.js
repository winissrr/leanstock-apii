const { Router } = require('express');
const c = require('../controllers/alertController');
const authMw = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const tenantScope = require('../middleware/tenantScope');

const r = Router();
r.use(authMw, tenantScope);
r.get('/', c.list);
r.patch('/:id', rbac('ADMIN', 'MANAGER'), c.update);
module.exports = r;
