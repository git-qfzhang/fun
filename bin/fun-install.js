#!/usr/bin/env node

'use strict';

const _ = require('lodash');
const Command = require('commander').Command;
const program = new Command('fun install');
const getVisitor = require('../lib/visitor').getVisitor;
const handler = require('../lib/exception-handler');
const { install, installAll, init, env, sbox } = require('../lib/commands/install');
const unrefTimeout = require('../lib/unref-timeout');
const notifier = require('../lib/update-notifier');
const { getSupportedRuntimesAsString } = require('../lib/common/model/runtime');


const autoExitOnWindows = () => {
  if (process.platform === 'win32') {
    // fix windows not auto exit bug after docker operation
    unrefTimeout(() => {
      // in order visitor request has been sent out
      process.exit(0); // eslint-disable-line
    });
  }
};

const convertOptions = (program) => {
  // convert long option to camelCase variable name,such as '--package-type' to 'packageType'
  const optionNames = _.map(program.options, (opt) => _.camelCase(opt.long));
  // pick the option properties into a new object.
  return _.pickBy(program, (_val, name) => _.includes(optionNames, name));
};

// [ 'A=B', 'B=C' ] => { A: 'B', B: 'C' }
const convertEnvs = (env) => (env || []).map(e => _.split(e, '=', 2))
  .filter(e => e.length === 2)
  .reduce((acc, cur) => (acc[cur[0]] = cur[1], acc), {});

program
  .usage('[-f|--function <[service/]function>] [-r|--runtime <runtime>] [-p|--pacakge-type <type>] [--save] [-e|--env key=val ...] [packageNames...]')
  .option('-f, --function <[service/]function>', `Specify which function to execute installation task.`)
  .option('-r, --runtime <runtime>', `function runtime, avaliable choice is: ${getSupportedRuntimesAsString(['dotnetcore2.1'])}`)
  .option('-e, --env <env>', 'environment variable, ex. -e PATH=/code/bin', (e, envs) => (envs.push(e), envs), [])
  .option('--save', 'add task to fun.yml file.')
  .option('-p, --package-type <type>', 'avaliable package type option: pip, apt.')
  .arguments('[packageNames...]')
  .description('install dependencies which are described in fun.yml file.')
  .action(async (packageNames, program) => {

    const options = convertOptions(program);

    // merge options default values.
    const opts = Object.assign({
      local: true
    }, options);

    opts.verbose = parseInt(process.env.FUN_VERBOSE) > 0;
    opts.env = convertEnvs(options.env);


    install(packageNames, opts).then(() => {

      autoExitOnWindows();

    }).catch(handler);


  });

program
  .command('init')
  .description('initialize fun.yml file.')
  .action(() => {
    getVisitor().then(visitor => {

      visitor.pageview('/fun/install/init').send();
      init().then((runtime) => {

        visitor.event({
          ec: 'install',
          ea: `init ${runtime}`,
          el: 'success',
          dp: '/fun/install/init'
        }).send();

      }).catch((error) => {

        visitor.event({
          ec: 'install',
          ea: `init`,
          el: 'error',
          dp: '/fun/install/init'
        }).send();

        handler(error);

      });
    });
  });

program
  .command('env')
  .description('print environment varables.')
  .action(() => {
    getVisitor().then(visitor => {
      visitor.pageview('/fun/install/env').send();

      env().then(() => {

        visitor.event({
          ec: 'install',
          ea: 'env',
          el: 'success',
          dp: '/fun/install/env'
        }).send();

        autoExitOnWindows();

      }).catch((error) => {

        visitor.event({
          ec: 'install',
          ea: `env`,
          el: 'error',
          dp: '/fun/install/env'
        }).send();

        handler(error);
      });
    });
  });

program
  .command('sbox')
  .usage('[-f|--function <[service/]function>] [-r|--runtime <runtime>] [-i|--interactive] [-e|--env key=val ...] [-e|--cmd <cmd>]')
  .description('Start a local sandbox for installation dependencies or configuration')
  .option('-f, --function <[service/]function>', `Specify which function to execute installation task.`)
  .option('-r, --runtime <runtime>', `function runtime, avaliable choice is: ${getSupportedRuntimesAsString(['dotnetcore2.1'])}`)
  .option('-i, --interactive', 'run as interactive mode. Keep STDIN open and allocate a pseudo-TTY when in a interactive shell.', false)
  .option('-e, --env <env>', 'environment variable, ex. -e PATH=/code/bin', [])
  .option('-c, --cmd <cmd>', 'command with arguments to execute inside the installation sandbox.')
  .action((prog) => {

    getVisitor().then(visitor => {
      visitor.pageview('/fun/install/sbox').send();

      const options = convertOptions(prog);
      if (program.function) {
        options.function = program.function;
      }
      if (program.runtime) {
        options.runtime = program.runtime;
      }

      if (!options.function && !options.runtime) {
        console.error('The `--runtime` or `--function` option is missing.');
        visitor.event({
          ec: 'install',
          ea: `sbox`,
          el: 'error',
          dp: '/fun/install/sbox'
        }).send();
        return;
      }

      if (!options.interactive && !options.cmd) {
        console.error('The `--interactive` or `--cmd` option is missing.');
        visitor.event({
          ec: 'install',
          ea: `sbox`,
          el: 'error',
          dp: '/fun/install/sbox'
        }).send();
        return;
      }

      options.envs = convertEnvs(program.env);

      sbox(options).then(() => {
        visitor.event({
          ec: 'install',
          ea: `sbox`,
          el: 'success',
          dp: '/fun/install/sbox'
        }).send();
      }).catch((error) => {
        visitor.event({
          ec: 'install',
          ea: `sbox`,
          el: 'error',
          dp: '/fun/install/sbox'
        }).send();

        handler(error);
      });
    });
  });

program.parse(process.argv);

notifier.notify();


if (!program.args.length) {

  if (program.packageType) {
    console.warn('Missing arguments [packageNames...], so the `--package-type` option is ignored.');
  }

  if (program.save) {
    console.warn('Missing arguments [packageNames...], so the `--save` option is ignored.');
  }

  getVisitor().then(visitor => {
    visitor.pageview('/fun/installAll').send();

    installAll(program.function, {
      verbose: parseInt(process.env.FUN_VERBOSE) > 0
    }).then(() => {
      visitor.event({
        ec: 'installAll',
        ea: 'installAll',
        el: 'success',
        dp: '/fun/installAll'
      }).send();

      autoExitOnWindows();

    }).catch(error => {
      visitor.event({
        ec: 'installAll',
        ea: 'installAll',
        el: 'error',
        dp: '/fun/installAll'
      }).send();

      handler(error);
    });
  });
}