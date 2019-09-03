'use strict';

const _ = require('lodash');
const { FunModule } = require('../install/module');

const { DockerfileParser } = require('dockerfile-ast');
const dockerOpts = require('../docker-opts');
const fs = require('fs-extra');

const RESERVED_DOCKER_CMD = [
  'FROM', 'Add', 'ONBUILD',
  'ARG', 'CMD', 'ENTRYPOINT',
  'VOLUME', 'STOPSIGNAL'];

function resolveEnv(envs = {}) {
  if (_.isString(envs)) {
    throw new Error('fun.yml env property must be a map');
  }

  return _.map(envs || {}, (v, k) => {
    if (k === 'PATH') {
      return `${k}=${v}:$PATH`;
    } else if (k === 'LD_LIBRARY_PATH') {
      return `${k}=${v}:$LD_LIBRARY_PATH`;
    }
    return `${k}=${v}`;
  });
}

function funymlToFunfile(funymlPath) {

  const funModule = FunModule.load(funymlPath);
  const runtime = funModule.runtime;

  const content = [];

  content.push(`RUNTIME ${runtime}`);

  content.push('COPY . /code');

  content.push('WORKDIR /code');

  for (const t of funModule.tasks) {
    let env = resolveEnv(t.attrs.env).join(' ');
    if (!_.isEmpty(env)) {
      env = ' ' + env;
    }
    
    const target = t.attrs.target;
    let targetParameter = '';

    if (target) {
      targetParameter = ` -t ${target}`;
    }

    const cwd = t.attrs.cwd;

    let cwdCmd = '';

    if (cwd) {
      cwdCmd = ` cd ${cwd} &&`;
    }

    switch (t.type) {
    case 'pip': {
      if (t.attrs.local) {
        content.push(`RUN${cwdCmd}${env} fun-install pip install ${t.attrs.pip}${targetParameter}`);
      } else {
        content.push(`RUN${cwdCmd}${env} pip install ${t.attrs.pip}`);
      }
      break;
    }
    case 'apt': {
      if (t.attrs.local) {
        content.push(`RUN${cwdCmd}${env} fun-install apt-get install ${t.attrs.apt}${targetParameter}`);
      } else {
        content.push(`RUN${cwdCmd}${env} apt-get install ${t.attrs.apt}`);
      }
      break;
    }
    case 'shell': {
      const commands = _.split(t.attrs.shell, '\n');

      let first = true;
      for (const command of commands) {
        if (command) {
          if (first) {
            content.push(`RUN${cwdCmd}${env} ${command}`);
            first = false;
          } else {
            const lastCommand = content.pop();
            content.push(`${lastCommand} \\`);
            content.push(` ${env} ${command}`);
          }
        }
      }

      break;
    }
    default: 
      console.error('unkown task %s', t);
    }
  }

  return content.join('\n');
}

async function funfileToDockerfile(funfilePath) {

  const content = await fs.readFile(funfilePath, 'utf8');

  const funfile = DockerfileParser.parse(content);

  const dockerfile = [];

  for (let instruction of funfile.getInstructions()) {

    const ins = instruction.getInstruction();

    if (_.includes(RESERVED_DOCKER_CMD, ins)) {
      throw new Error(`Currently, Funfile does not support the semantics of '${ins}'. 
If you have a requirement, you can submit the issue at https://github.com/alibaba/funcraft/issues.`);
    }

    if (ins.toUpperCase() === 'RUNTIME') {
      const runtimeArgs = instruction.getArguments();

      if (runtimeArgs.length !== 1) {
        throw new Error('invalid RUNTIME for Funfile');
      }

      const runtime = runtimeArgs[0].getValue();

      dockerfile.push('FROM ' + await dockerOpts.resolveRuntimeToDockerImage(runtime, true));
    } else {
      const range = instruction.getRange();

      dockerfile.push(instruction.getRangeContent(range));
    }
  }

  return dockerfile.join('\n');
}

module.exports = { funymlToFunfile, funfileToDockerfile };