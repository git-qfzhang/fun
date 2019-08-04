'use strict';
const { Server } = require('@webserverless/fc-express');
const express = require('express');
require('express-async-errors');

const fs = require('fs-extra');
const getRawBody = require('raw-body');
const execute = require('./lib/execute');
const rimraf = require('rimraf');
const path = require('path');
const splitFile = require('split-file');

const { readTmpDir, mapToJson } = require('./lib/path');
const { getFileHash, unzipFile, writeBufToFile, filesNameAndHash } = require('./lib/file');

const app = express();

// query nas files stats inside a directory
app.get('/nas/stats', async (req, res) => {
  console.log('received stats request, query is: ' + req.query);

  const fileHashValue = req.query.fileHashValue;
  const fileName = req.query.fileName;
  const dstDir = req.query.dstPath;

  console.log(`checkHasUploadServer parameters fileHashValue: ${fileHashValue}, fileName ${fileName}`);

  const tmpDir = path.join(dstDir, '.fun_nas_tmp', fileHashValue);
  
  if (await fs.pathExists(tmpDir)) {

    console.log('tmpDir exist: ' + tmpDir);

    const stats = await fs.lstat(tmpDir);

    if (stats.isFile()) {
      throw new Error(`tmpDir ${tmpDir} could not be a file, it must be not exist or a folder`);
    }

    const uploadedSplitFiles = await filesNameAndHash(tmpDir);
    const uploadedSplitFilesJson = mapToJson(uploadedSplitFiles);
    
    res.send({
      nasTmpDir: tmpDir,
      dstDir: dstDir,
      uploadedSplitFiles: uploadedSplitFilesJson
    });
  } else {
    console.log('tmpDir not exist, will create one: ' + tmpDir);

    await fs.ensureDir(tmpDir);

    res.send({
      nasTmpDir: tmpDir,
      dstDir: dstDir,
      uploadedSplitFiles: {}
    });
  }
});

// exec commands
app.post('/commands', async (req, res) => {
  console.log('received commands request, query is: ' + JSON.stringify(req.query));

  const cmd = req.query.cmd;

  if (!cmd) { throw new Error('missing cmd parameter'); }

  console.log('received cmd: ' + cmd);
  const execRs = await execute(cmd);
  res.send(execRs);
});

// upload splited file to server
app.post('/split/uploads', async (req, res) => {
  console.log('received split uploads request, query is: ' + JSON.stringify(req.query));

  const fileName = req.query.fileName;
  const nasTmpDir = req.query.nasTmpDir;
  const fileHashValue = req.query.fileHashValue;

  const body = await getRawBody(req);

  const dstSplitFile = path.join(nasTmpDir, fileName);
  console.log(`dstSplitFile : ${dstSplitFile}`);

  await writeBufToFile(dstSplitFile, body);

  const writeddotSplitFileHash = await getFileHash(dstSplitFile);
  
  if (writeddotSplitFileHash === fileHashValue) {
    res.send({
      stat: 1,
      desc: `${fileName} send success`
    });
  } else {
    // 传输过程中出了问题，可以让用户重新同步
    rimraf.sync(dstSplitFile);

    throw new Error('split file hash changes, you need to re-sync');
  }
});

// used for sync local folder to server
// 
// 1. upload a zip file to server
// 2. unzip the zip file to dstDir
// 3. remove the zip file
// 
// Parameters examples:
// dstDir: /mnt/auto
// fileHashValue: eb276e495e382b0e5376de16f92a0e86
// fileName: .nasDemo.zip
app.post('/uploads', async (req, res) => {
  console.log('received uploads request, query is: ' + req.query);

  const dstDir = req.query.dstDir;
  const fileHashValue = req.query.fileHashValue;
  const fileName = req.query.fileName;

  console.log(`uploadFileServer ${dstDir}, fileHashValue ${fileHashValue}, fileName ${fileName}`);

  const body = await getRawBody(req);

  // nasFile: /mnt/auto/.nasDemo.zip
  const nasFile = path.join(dstDir, fileName);

  console.log(`nasFile ${nasFile}`);

  await writeBufToFile(nasFile, body);

  const nasFileHash = await getFileHash(nasFile);

  console.log('nasFileHash is ' + nasFileHash);

  if (nasFileHash === fileHashValue) {
    console.log('nasFileHash === fileHashValue');

    console.log(`unzip nasfile ${nasFile} to ${dstDir}`);

    await unzipFile(nasFile, dstDir);

    console.log('unzip file done');
    rimraf.sync(nasFile);
    res.send({ stat: 1, desc: 'Folder saved' });
  } else {
    rimraf.sync(nasFile);
    throw new Error('file hash changes, you need to re-sync');
  }  
});

app.post('/split/merge', async (req, res) => {  
  console.log('received merge request, query is: ' + req.query);

  const nasTmpDir = req.query.nasTmpDir;
  const dstDir = req.query.dstDir;
  const fileName = req.query.fileName;
  const FileHashValue = req.query.fileHashValue;

  const nasFile = path.join(dstDir, fileName);

  const splitFilesPaths = await readTmpDir(nasTmpDir);

  console.log('merge files: ' + JSON.stringify(splitFilesPaths) + ' to ' + nasFile);

  await splitFile.mergeFiles(splitFilesPaths, nasFile);

  const persistedNasHashValue = await getFileHash(nasFile);

  console.log('hash value : ' + FileHashValue);

  if (persistedNasHashValue === FileHashValue) {
    console.log('persistedNasHashValue is equal to parameter FileHashValue ', persistedNasHashValue);

    console.log('unzip nas file ' + nasFile + ' dstDir ' + dstDir);
    
    await unzipFile(nasFile, dstDir);

    console.log('unzip nas file done');

    rimraf.sync(nasFile);
    rimraf.sync(nasTmpDir);

    res.send({
      desc: 'unzip success'
    });
  } else {
    console.error('persistedNasHashValue is not equal to parameter nasFileHashValue ', persistedNasHashValue);
    rimraf.sync(nasFile);
    rimraf.sync(nasTmpDir);
    throw new Error('file hash changes, you need to re-sync');
  }

});

app.get('/stats', async (req, res) => {
  console.log('received stats reqeust, query is: ' + req.query);

  const dstPath = req.query.dstPath;

  if (!dstPath) { throw new Error('missing dstPath parameter'); }

  if (await fs.pathExists(dstPath)) {
    const stats = await fs.lstat(dstPath);

    res.send({
      path: dstPath,
      isExist: true,
      isDir: stats.isDirectory(),
      isFile: stats.isFile()
    });
  } else {
    res.send({
      path: dstPath,
      isExist: false,
      isDir: false,
      isFile: false
    });
  }
});

app.use((err, req, res, next) => {
  console.error(err);

  res.send({ error: err.message });
});

const server = new Server(app);

module.exports.handler = function (req, res, context) {
  server.httpProxy(req, res, context);
};

module.exports.app = app;