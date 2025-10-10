#!/usr/bin/env node

// Simple test script to verify vocabulary implementation in estimate-detail.tsx
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing vocabulary implementation in estimate-detail.tsx...\n');

// Read the file
const filePath = path.join(__dirname, 'client/src/pages/estimate-detail.tsx');
const content = fs.readFileSync(filePath, 'utf-8');

// Tests to check for vocabulary implementation
const tests = [
  {
    name: 'VocabularyProvider imported',
    pattern: /import.*{.*VocabularyProvider.*}.*from.*vocabulary-context/,
    expected: true,
  },
  {
    name: 'useVocabulary hook imported',
    pattern: /import.*{.*useVocabulary.*}.*from.*vocabulary-context/,
    expected: true,
  },
  {
    name: 'vocabulary variable defined',
    pattern: /const vocabulary = useVocabulary\(\)/,
    expected: true,
  },
  {
    name: 'Dynamic Epic labels',
    pattern: /\{vocabulary\.epic\}/,
    expected: true,
  },
  {
    name: 'Dynamic Stage labels',
    pattern: /\{vocabulary\.stage\}/,
    expected: true,
  },
  {
    name: 'Dynamic Workstream labels',
    pattern: /\{vocabulary\.workstream\}/,
    expected: true,
  },
  {
    name: 'VocabularyProvider wrapper',
    pattern: /<VocabularyProvider.*estimateId.*clientId/,
    expected: true,
  },
  {
    name: 'No hard-coded Epic labels',
    pattern: /<Label[^>]*>Epic<\/Label>/,
    expected: false,  // Should NOT find this
  },
  {
    name: 'No hard-coded Stage labels',
    pattern: /<Label[^>]*>Stage<\/Label>/,
    expected: false,  // Should NOT find this
  },
  {
    name: 'No hard-coded Workstream labels',
    pattern: /<Label[^>]*>Workstream<\/Label>/,
    expected: false,  // Should NOT find this
  },
];

let passed = 0;
let failed = 0;

tests.forEach(test => {
  const found = test.pattern.test(content);
  const pass = found === test.expected;
  
  if (pass) {
    console.log(`✅ ${test.name}`);
    passed++;
  } else {
    console.log(`❌ ${test.name} - ${test.expected ? 'NOT FOUND' : 'STILL PRESENT'}`);
    failed++;
  }
});

// Count vocabulary usage
const epicCount = (content.match(/vocabulary\.epic/g) || []).length;
const stageCount = (content.match(/vocabulary\.stage/g) || []).length;
const workstreamCount = (content.match(/vocabulary\.workstream/g) || []).length;

console.log('\n📊 Vocabulary Usage Statistics:');
console.log(`   - Epic references: ${epicCount}`);
console.log(`   - Stage references: ${stageCount}`);
console.log(`   - Workstream references: ${workstreamCount}`);
console.log(`   - Total dynamic references: ${epicCount + stageCount + workstreamCount}`);

console.log('\n📋 Test Summary:');
console.log(`   - Tests passed: ${passed}/${tests.length}`);
console.log(`   - Tests failed: ${failed}/${tests.length}`);

if (failed === 0) {
  console.log('\n🎉 SUCCESS: All vocabulary tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  WARNING: Some tests failed. Review the implementation.');
  process.exit(1);
}