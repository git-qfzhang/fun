'use strict';

const util = require('util');
const os = require('os');
const fs = require('fs');

const mkdirp = require('mkdirp-promise');
const rimraf = require('rimraf');
const writeFile = util.promisify(fs.writeFile);

const path = require('path');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const sandbox = sinon.createSandbox();
const assert = sinon.assert;


const request = {
  statsRequest: sandbox.stub(), 
  checkHasUpload: sandbox.stub(), 
  sendMergeRequest: sandbox.stub(), 
  uploadSplitFile: sandbox.stub(), 
  uploadFile: sandbox.stub()
};

const file = {
  zipWithArchiver: sandbox.stub()
};

const uploadStub = proxyquire('../../../lib/nas/cp/upload', {
  '../request': request, 
  './file': file
});

describe('upload test', () => {
  const srcPath = `${os.homedir()}/local-nas-dir/`;
  const dstPath = '/mnt/nas';
  const nasHttpTriggerPath = '/proxy/';
  const zipDst = path.join(path.dirname(srcPath), `.${path.basename(srcPath)}.zip`);

  beforeEach(async () => {
    await mkdirp(`${os.homedir()}/local-nas-dir/`);

    request.sendMergeRequest.returns({
      headers: 200, 
      data: {
        desc: 'unzip success'
      }
    });

    request.uploadFile.returns({
      headers: 200, 
      data: {
        stat: 1,
        desc: 'Folder saved'
      }
    });

    request.checkHasUpload.returns({
      headers: 200, 
      data: {
        nasTmpDir: '/mnt/nas/.tmp',
        dstDir: '/mnt/nas',
        uploadedSplitFiles: '{}'
      }
    });
    request.statsRequest.returns({
      headers: 200, 
      data: {
        path: '/mnt/nas',
        isExist: true,
        isDir: true,
        isFile: false
      }
    });

    file.zipWithArchiver.returns(zipDst);
    request.uploadSplitFile.returns();
  });

  afterEach(() => {
    sandbox.resetHistory();
    rimraf.sync(`${os.homedir()}/local-nas-dir/`);
  });

  it('upload file more than 5M', async() => { 
    await writeFile(zipDst, new Buffer(10 * 1024 * 1024));

    await uploadStub(srcPath, dstPath, nasHttpTriggerPath);

    assert.calledWith(request.statsRequest, dstPath, nasHttpTriggerPath);
    
    assert.calledOnce(request.checkHasUpload);
    
    assert.notCalled(request.uploadFile);
    assert.called(request.uploadSplitFile);
    assert.calledOnce(request.sendMergeRequest);
    assert.calledWith(file.zipWithArchiver, srcPath);
  });

  it('upload file less than 5M', async () => {
    
    await writeFile(zipDst, new Buffer(4 * 1024 * 1024));
    

    await uploadStub(srcPath, dstPath, nasHttpTriggerPath);

    assert.calledWith(request.statsRequest, dstPath, nasHttpTriggerPath);
    assert.calledOnce(request.checkHasUpload);
    assert.calledOnce(request.uploadFile);
    assert.notCalled(request.uploadSplitFile);
    assert.notCalled(request.sendMergeRequest);
    assert.calledWith(file.zipWithArchiver, srcPath);
  });
});