'use strict';

const url = require('url');
const dotgitconfig = require('dotgitconfig');
const { execFileSync } = require('child_process');

module.exports = class LCL {
  constructor(dir = process.cwd()) {
    const { GIT_DIR } = process.env;
    this.gitDirStr = GIT_DIR ? `--git-dir ${GIT_DIR}/.git` : '';
    this.cwd = dir;
  }

  async getLastCommit() {
    return this.getLastCommitSync();
  }

  getLastCommitSync() {
    const prettyFormat = [
      '%h', '%H', '%s', '%f', '%b',
      '%ct', '%cr', '%cn', '%ce',
      '%at', '%ar', '%an', '%ae',
    ];
    const splitCharacter = '<#__last-commit-log__#>';
    const command = [this.gitDirStr, 'log', '-1', '--pretty-format:"', prettyFormat.join(splitCharacter), '"'];

    let c;
    let gitRemote;
    let gitBranch;
    let gitTag;
    try {
      const opts = {
        cwd: this.cwd,
        maxBuffer: 1024 * 1024 * 1024,
      };
      const stdout = execFileSync('git', command, opts).toString();
      c = stdout.split(splitCharacter);
      gitBranch = getGitBranch({
        gitDirStr: this.gitDirStr,
        ...opts,
      }, {
        shortHash: c[0],
      });
      args = [this.gitDirStr, 'tag', '--contains', 'HEAD'];
      const tag = execFileSync('git', args, opts).toString();
      gitTag = tag.trim();
      const config = dotgitconfig(this.cwd);
      gitRemote = config.remote && config.remote.origin && config.remote.origin.url;
    } catch (e) {
      throw new Error(`Can't get last commit, ${e}`);
    }

    return {
      gitTag,
      gitBranch,
      gitRemote,
      gitUrl: this._formatGitHttpUrl(gitRemote),
      shortHash: c[0],
      hash: c[1],
      subject: c[2],
      sanitizedSubject: c[3],
      body: c[4],
      committer: {
        date: c[5],
        relativeDate: c[6],
        name: c[7],
        email: c[8],
      },
      author: {
        date: c[9],
        relativeDate: c[10],
        name: c[11],
        email: c[12],
      },
    };
  }

  /**
   * git@github.com:group/repo.git     => http://github.com/group/repo
   * https://user@token@github.com/group/repo.git => https://github.com/group/repo
   */
  _formatGitHttpUrl(remote = '') {
    if (remote.startsWith('git@')) {
      return 'http://' + remote
        .replace(/^git@/, '')
        .replace(/\.git$/, '')
        .replace(/:/, '/');
    }
    if (remote.startsWith('http') && remote.endsWith('.git')) {
      const parsed = url.parse(remote.replace(/\.git$/, ''));
      return `${parsed.protocol}//${parsed.host}${parsed.path}`;
    }
    return remote;
  }
};

function getGitBranch(opts = {}, { shortHash }) {
  let _branch = '';

  var args = [opts.gitDirStr, 'rev-parse', '--abbrev-ref', 'HEAD'];
  const revParseBranch = execFileSync('git', args, opts).toString();

  args = [opts.gitDirStr, 'name-rev', '--name-only', 'HEAD'];
  const nameRevBranch = execFileSync('git', args, opts).toString();

  args = [opts.gitDirStr, 'log', '-n' , '1', '--pretty=%d', 'HEAD'];
  const gitLogBranch = execFileSync('git', args, opts).toString();

  const branchRP = revParseBranch.trim();
  const branchNR = nameRevBranch.trim()
    .replace('remotes/origin/', '')
    .replace(/~\d+$/, ''); // in case 'develop~1'
  const branchGL = gitLogBranch.split(',')
    .filter(i => i.includes('origin/'))
    .map(i => i.trim())
    .map(i => i.split('/')[1])
    .map(i => i.replace(/[()]/, ''))
    .filter(i => i !== 'HEAD');
  _branch = branchRP !== 'HEAD'
    ? branchRP
    : !branchNR.startsWith('tags/')
      ? branchNR : branchGL.length > 1
        ? branchGL.filter(i => i !== 'master')[0] : branchGL[0];
  // in case branch is deleted
  if (!_branch) {
    _branch = `branch_is_deleted_${shortHash}`;
  }
  return _branch;
}

module.exports.diff = require('./line-diff');
