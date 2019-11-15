const fs = require('fs');
const model = require('./model/model');
const execSync = require('child_process').execSync;
const path = require('path');

const testerDir = path.join(__dirname, "../tester");
const dockerDir = "/home"; // TODO: 나중에 서버로 옮겼을 때 제거해야합니다.

//TODO: spj 구현하세요.
//TODO: java python compile 구현하세요.

//TODO: 서버를 AWS로 옮겼을 때 script를 docker 없이 사용하는것으로 고쳐주세요.
const Compiler = {
    'c': function(user_code) {
        fs.writeFileSync('../tester/test.c', user_code, 'utf8');
        const script = 'docker run --rm -v' + ' ' + testerDir + ':' + dockerDir + ' ' +
            'gcc gcc /home/test.c -o /home/test.o -O2 -Wall -lm -static -std=c99 -DONLINE_JUDGE -DBOJ';

        let ret = { success: false, stdout: ''};
        try {
            const stdout = execSync(script).toString();
            ret.success = true;
            ret.stdout = stdout;
        } catch(exception) {
            const stdout = exception.stderr.toString();
            ret.success = false;
            ret.stdout = stdout;
        }

        return ret;
    },
    'cpp': function(user_code) {
        fs.writeFileSync('../tester/test.cc', user_code, 'utf8');
        const script = 'docker run --rm -v' + ' ' + testerDir + ':' + dockerDir + ' ' +
            'gcc g++ /home/test.cc -o /home/test.o -O2 -Wall -lm -static -std=gnu++17 -DONLINE_JUDGE -DBOJ';

        let ret = { success: false, stdout: '' };
        try {
            const stdout = execSync(script).toString();
            ret.success = true;
            ret.stdout = stdout;
        } catch(exception) {
            const stdout = exception.stderr.toString();
            ret.success = false;
            ret.stdout = stdout;
        }

        return ret;

    },
    'java': function(user_code) {

    },
    'python': function(user_code) {

    }
};

const seccomp_rule = function(lang) {
    switch(lang) {
        case 'c':
            return 'c_cpp';
        case 'cpp':
            return 'c_cpp';
        default:
            return 'general';
    }
};

const state_set = function(state_number, pending_number, error_message) {
    model.judge.where('pending_number').equals(pending_number)
        .update({$set: {state: state_number, ErrorMessage: error_message}}).then(result => {
            //TODO: 로깅할것인가?
            console.log(result);
        }).catch(err => {
            //TODO: database error도 로깅할것인가?
            console.log(err);
    });
};


const pushQueue = function(Queue, judgeObj) {
    let user_code = "";
    let user_lang = undefined;
    let error_message = "";
    const max_process_number = 200; // TODO: 나중에 고쳐주세요.
    const max_output_size = 2097152; // TODO: 나중에 고쳐주세요.
    Queue.place(function() {
        model.judge.findOne()
            .where('pending_number').equals(judgeObj.pending_number)
            .then(result => {
                if(!result) throw new Error('none-pending');
                user_code = result.code;
                user_lang = result.language;
                return model.problem.findOne()
                    .where('problem_number').equals(result.problem_number);
            }).then(result => {
                if(!result) throw new Error('none-problem');
                if(Compiler[user_lang] === undefined) throw new Error('none-language');

                const lang = user_lang;

                const errCheck = Compiler[lang](user_code);

                error_message = errCheck.stdout;
                if(!errCheck.success) throw new Error('Compile-Error\n' + errCheck.stdout);

                for(let i = 0; i < result.input_list.length; i++) {
                    fs.writeFileSync('../tester/input.txt', result.input_list[i].txt, 'utf8');

                    //TODO: 서버를 AWS로 옮겼을 때 script를 docker 없이 사용하는것으로 고쳐주세요.
                    const script = 'docker run --rm -v' + ' ' + testerDir + ':' + dockerDir + ' ' +
                        lang + ' ' + '/home/libjudger.so' + ' ' + '--max_cpu_time=' + result.time_limit + ' ' +
                        '--max_real_time=' + (result.time_limit * 5) + ' ' + '--max_memory=' + result.memory_limit + ' ' +
                        '--max_process_number=' + max_process_number + ' ' + '--max_output_size=' + max_output_size + ' ' +
                        '--exe_path="/home/test.o"' + ' ' + '--input_path="/home/input.txt"' + ' ' +
                        '--output_path="/home/output.txt"' + ' ' + '--error_path="/home/error.txt"' + ' ' + '--uid=0' + ' ' +
                        '--gid=0' + ' ' + '--seccomp_rule_name=' + seccomp_rule(lang);

                    const stdout = execSync(script).toString();
                    const status = JSON.parse(stdout);

                    // TODO: 개별 채점 해야하는가? 백준식 채점이 좋은가? 개별 채점 구현하려면 스키마를 바꿔야합니다.
                    if(status.result === 4) {
                        if(status.signal === 25) throw new Error('Presentation-Error');
                        else throw new Error('Runtime-Error');
                    }
                    else if(status.result === 1 || status.result === 2) throw new Error('Timelimit-Error');
                    else if(status.result === 3) throw new Error('Memorylimit-Error');
                    else if(status.result !== 0) throw new Error('Server-Error');

                    const user_output = fs.readFileSync('../tester/output.txt', 'utf8').toString();
                    const system_output = result.output_list[i].txt;

                    const user_output_cmp = user_output.split('\n');
                    const system_output_cmp = system_output.split('\n');

                    while(user_output_cmp[user_output_cmp.length - 1].trimEnd() === '') {
                        user_output_cmp.splice(user_output_cmp.length - 1);
                    }

                    while(system_output_cmp[system_output_cmp.length - 1].trimEnd() === '') {
                        system_output_cmp.splice(system_output_cmp.length - 1);
                    }

                    if(system_output_cmp.length !== user_output_cmp.length) throw new Error('Wrong-Answer');

                    for(let j = 0; j < system_output_cmp.length; j++) {
                        if(system_output_cmp[j].trimEnd() !== user_output_cmp[j].trimEnd()) throw new Error('Wrong-Answer');
                    }
                }
                state_set(2, judgeObj.pending_number, error_message);
                Queue.next();
            }).catch(err => {
                if(typeof err.message === 'undefined') {
                    console.log('Hello undefined');
                    // TODO: 채점 sever 문제는 중대하므로 로깅으로 나중에 꼭 고칠 것
                    console.log(err);
                }
                else if(typeof err.message !== 'string') {
                    console.log(typeof err.message);
                    // TODO: 채점 sever 문제는 중대하므로 로깅으로 나중에 꼭 고칠 것
                    console.log(err);
                }
                else if(err.message.split('\n')[0] === 'Compile-Error') {
                    /***
                     * 컴파일 에러
                     */
                    state_set(8, judgeObj.pending_number, error_message);
                }
                else if(err.message === 'Wrong-Answer') {
                    /***
                     * 오답
                     */
                    state_set(3, judgeObj.pending_number, error_message);
                }
                else if(err.message === 'Timelimit-Error') {
                    /***
                     * 시간 초과
                     */
                    state_set(4, judgeObj.pending_number, error_message);
                }
                else if(err.message === 'Memorylimit-Error') {
                    /***
                     * 메모리 초과
                     */
                    state_set(5, judgeObj.pending_number, error_message);
                }
                else if(err.message === 'Runtime-Error') {
                    /***
                     * 런타임 에러
                     */
                    state_set(6, judgeObj.pending_number, error_message);
                }
                else if(err.message === 'Presentation-Error') {
                    /***
                     * 출력초과
                     */
                    state_set(7, judgeObj.pending_number, error_message);
                }
                else {
                    //TODO: 채점 server 문제는 중대하므로 로깅으로 나중에 꼭 고칠 것
                    console.log(err);
                }
                Queue.next();
        });
    });
};

module.exports = pushQueue;