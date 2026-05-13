const { Router } = require('express');
const c = require('../controllers/productController');
const authMw = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const tenantScope = require('../middleware/tenantScope');

const r = Router();
r.use(authMw, tenantScope);
r.get('/', c.list);
r.post('/', rbac('ADMIN', 'MANAGER'), c.create);
r.get('/:id', c.getOne);
r.patch('/:id', rbac('ADMIN', 'MANAGER'), c.update);
r.delete('/:id', rbac('ADMIN', 'MANAGER'), c.remove);
module.exports = r;
