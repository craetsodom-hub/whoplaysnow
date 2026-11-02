import {readFile} from 'node:fs/promises';
import {auditCompetitionCoverage} from '../lib/competition-coverage';
const snapshot=JSON.parse(await readFile((process.env.DATA_DIR||'runtime')+'/schedule.json','utf8'));
const report=auditCompetitionCoverage(snapshot);
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--strict')&&(report.missingArtwork.length||report.sourceFailures.length))process.exitCode=1;
