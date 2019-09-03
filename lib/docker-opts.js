'use strict';

const {
  generateDockerDebugOpts
} = require('./debug');

const debug = require('debug')('docker-opts');
const nestedObjectAssign = require('nested-object-assign');
const { addEnv } = require('./install/env');

const _ = require('lodash');

const { red } = require('colors');
const net = require('net');
const getVisitor = require('../lib/visitor').getVisitor;

const ALIYUN_REGISTRY = 'registry.cn-beijing.aliyuncs.com';

let isFromChinaMotherlandCache;

const runtimeImageMap = {
  'nodejs6': 'nodejs6',
  'nodejs8': 'nodejs8',
  'python2.7': 'python2.7',
  'python3': 'python3.6',
  'java8': 'java8',
  'php7.2': 'php7.2',
  'nodejs10': 'nodejs10',
  'custom': 'custom'
};

function resolveDockerEnv(envs = {}) {
  return _.map(addEnv(envs || {}), (v, k) => `${k}=${v}`);
}

async function doImageRegisterEventTag(el) {
  const visitor = await getVisitor();
  visitor.event({
    ec: 'imageRegistry',
    ea: 'resolve',
    el 
  }).send();
}

async function doResolveDockerRegistry(isDockerhubRegistry) {
  await doImageRegisterEventTag('start');
  if (isDockerhubRegistry) {
    await doImageRegisterEventTag('dockerhubRegistry');
    return '';
  }
  await doImageRegisterEventTag('aliyunRegistry');
  return ALIYUN_REGISTRY;
}

function isFromChinaMotherland() {
  if (isFromChinaMotherlandCache !== undefined) {
    return Promise.resolve(isFromChinaMotherlandCache);
  }
  return new Promise((resolve, reject) => {
    const s = new net.Socket();
    const doResolve = (isInside) => {
      isFromChinaMotherlandCache = isInside;
      resolve(isFromChinaMotherlandCache);
      s.destroy();
    };

    s.connect(443, 'google.com', () => doResolve(false));
    s.on('error', () => doResolve(true));
    s.setTimeout(1000, () => doResolve(true));
  });
}

async function resolveDockerRegistry() {
  try {
    if (await isFromChinaMotherland()) {
      return doResolveDockerRegistry(false);
    }
  } catch (error) {
    return doResolveDockerRegistry(true);
  }
  return doResolveDockerRegistry(true);
}

const IMAGE_VERSION = '1.6.0';

async function resolveRuntimeToDockerImage(runtime, isBuild) {
  if (runtimeImageMap[runtime]) {
    const name = runtimeImageMap[runtime];
    var imageName;
    if (isBuild) {
      imageName = `aliyunfc/runtime-${name}:build-${IMAGE_VERSION}`;
    } else {
      imageName = `aliyunfc/runtime-${name}:${IMAGE_VERSION}`;
    }

    const dockerImageRegistry = await resolveDockerRegistry();
    if (dockerImageRegistry) {
      imageName = `${dockerImageRegistry}/${imageName}`;
    }

    debug('imageName: ' + imageName);

    return imageName;
  }

  throw new Error(red(`invalid runtime name ${runtime}`));
}


function generateInstallOpts(imageName, mounts, envs) {
  return {
    Image: imageName,
    Tty: true,
    Env: resolveDockerEnv(envs),
    Cmd: ['/bin/bash'],
    HostConfig: {
      AutoRemove: true,
      Mounts: mounts
    }
  };
}

function generateSboxOpts({imageName, hostname, mounts, envs, cmd = [], isTty, isInteractive}) {
  return {
    Image: imageName,
    Hostname: hostname,
    AttachStdin: isInteractive,
    AttachStdout: true,
    AttachStderr: true,
    Tty: isTty,
    OpenStdin: isInteractive,
    StdinOnce: true,
    Env: resolveDockerEnv(envs),
    Cmd: cmd.length ? cmd : ['/bin/bash'],
    HostConfig: {
      AutoRemove: true,
      Mounts: mounts
    }
  };
}

function transformPathForVirtualBox(source) {
  // C:\\Users\\image_crawler\\code -> /c/Users/image_crawler/code
  const sourcePath = source.split(':').join('');
  const lowerFirstAndReplace = _.lowerFirst(sourcePath.split('\\').join('/'));
  return '/' + lowerFirstAndReplace;
}

function transformMountsForToolbox(mounts) {

  console.warn(red(`We detected that you are using docker toolbox. For a better experience, please upgrade 'docker for windows'.\nYou can refer to Chinese doc https://github.com/alibaba/funcraft/blob/master/docs/usage/installation-zh.md#windows-%E5%AE%89%E8%A3%85-docker or English doc https://github.com/alibaba/funcraft/blob/master/docs/usage/installation.md.\n`));

  if (Array.isArray(mounts)) {
    return mounts.map(m => {

      return transformSourcePathOfMount(m);
    });
  } 
  return transformSourcePathOfMount(mounts);
}

function transformSourcePathOfMount(mountsObj) {

  if (!_.isEmpty(mountsObj)) {

    const replaceMounts = Object.assign({}, mountsObj);
    replaceMounts.Source = transformPathForVirtualBox(mountsObj.Source);
    return replaceMounts;
  }
  return {};
}

async function generateContainerBuildOpts(runtime, containerName, mounts, cmd, envs, preferredImage) {

  const hostOpts = {
    HostConfig: {
      AutoRemove: true,
      Mounts: mounts
    }
  };

  const ioOpts = {
    OpenStdin: true,
    Tty: false,
    StdinOnce: true,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true
  };

  const imageName = await resolveRuntimeToDockerImage(runtime, true);

  const opts = nestedObjectAssign(
    {
      Env: resolveDockerEnv(envs),
      Image: preferredImage || imageName,
      name: containerName,
      Cmd: cmd,
      User: '0:0'
    },
    ioOpts,
    hostOpts);


  debug('fc-docker docker options: %j', opts);

  return opts;
}

async function generateLocalInvokeOpts(runtime, containerName, mounts, cmd, debugPort, envs, dockerUser, debugIde) {

  const hostOpts = {
    HostConfig: {
      AutoRemove: true,
      Mounts: mounts
    }
  };

  let debugOpts = {};
  
  if (debugPort) {
    debugOpts = generateDockerDebugOpts(runtime, debugPort, debugIde);
  }

  const ioOpts = {
    OpenStdin: true,
    Tty: false,
    StdinOnce: true,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true
  };

  const imageName = await resolveRuntimeToDockerImage(runtime);

  const opts = nestedObjectAssign(
    {
      Env: resolveDockerEnv(envs),
      Image: imageName,
      name: containerName,
      Cmd: cmd,
      User: dockerUser
    },
    ioOpts,
    hostOpts,
    debugOpts);


  debug('fc-docker docker options: %j', opts);

  return opts;
}

function resolveMockScript(runtime) {
  return `/var/fc/runtime/${runtime}/mock.sh`;
}

async function generateLocalStartRunOpts(runtime, name, mounts, cmd, debugPort, envs, dockerUser, debugIde) {

  const hostOpts = {
    HostConfig: {
      AutoRemove: true,
      Mounts: mounts
    }
  };

  let debugOpts = {};

  if (debugPort) {
    debugOpts = generateDockerDebugOpts(runtime, debugPort, debugIde);
  }

  const imageName = await resolveRuntimeToDockerImage(runtime);

  const opts = nestedObjectAssign(
    {
      Env: resolveDockerEnv(envs),
      Image: imageName,
      name,
      Cmd: cmd,
      User: dockerUser,
      Entrypoint: [resolveMockScript(runtime)]
    },
    hostOpts,
    debugOpts);

  debug('docker options: %j', opts);

  return opts;
}

module.exports = {
  generateLocalInvokeOpts, resolveRuntimeToDockerImage, 
  generateInstallOpts, generateSboxOpts,
  generateLocalStartRunOpts,
  resolveMockScript, resolveDockerEnv, transformPathForVirtualBox,
  resolveDockerRegistry, transformMountsForToolbox, transformSourcePathOfMount,
  isFromChinaMotherland, ALIYUN_REGISTRY, generateContainerBuildOpts,
  IMAGE_VERSION
};