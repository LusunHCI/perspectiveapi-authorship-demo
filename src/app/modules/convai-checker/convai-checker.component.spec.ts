/*
Copyright 2017 Google Inc.

Licensed under the Apache License, Version 2.0 (the 'License');
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an 'AS IS' BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import {
  Component,
  OnInit,
  ViewChild
} from '@angular/core';
import {
  ComponentFixture,
  TestBed,
  async,
  fakeAsync,
  tick,
  flush,
  flushMicrotasks,
  getTestBed,
} from '@angular/core/testing';


import {
  MockBackend,
  MockConnection
} from '@angular/http/testing';
import {
  BaseRequestOptions,
  Http,
  Response,
  ResponseOptions,
  XHRBackend
} from '@angular/http';
import { By } from '@angular/platform-browser';
import {
  HttpClientTestingModule,
  HttpTestingController
} from '@angular/common/http/testing';

import * as test_components from './test-components';
import { PerspectiveStatusComponent, CommentFeedback, Emoji, LoadingIconStyle, Shape } from './perspective-status.component';
import { ConvaiCheckerComponent, REQUEST_LIMIT_MS, DEFAULT_DEMO_SETTINGS, DemoSettings } from './convai-checker.component';
import { PerspectiveApiService } from './perspectiveapi.service';
import { AnalyzeCommentResponse } from './perspectiveapi-types';
import { take } from 'rxjs/operators';
import * as d3 from 'd3-color';

const getMockCheckerResponse = function(toxicityScore: number|null,
                                        token: string,
                                        otherAttributeScore?: number):
  AnalyzeCommentResponse {
  return {
    attributeScores: {
      'TOXICITY': {
        summaryScore: {
          value: toxicityScore,
          type: 'PROBABILITY'
        },
      },
      'OTHER_ATTRIBUTE': {
        summaryScore: {
          value: otherAttributeScore || toxicityScore,
          type: 'PROBABILITY'
        },
      }
    },
    languages: ['en'],
    clientToken: token,
  };
};

const getIsElementWithIdVisible = function(id: string): boolean {
  const element = document.getElementById(id);
  return element != null && element.offsetWidth > 0 && element.offsetHeight > 0
      && window.getComputedStyle(element).display !== 'none'
      && getElementOpacity(id) > 0;
};

const getElementExists = function(id: string): boolean {
  return document.getElementById(id) !== null;
};

const getElementXTranslation = function(id: string): number|null {
  const element = document.getElementById(id);
  if (!element) {
    return null;
  }
  let transform = window.getComputedStyle(element).getPropertyValue('transform');
  if (transform === 'none') {
    // There is a bug where sometimes getComputedStyle doesn't recognize the
    // transform, so parse it manually with a regex if this happens.
    const transformIndex = element.outerHTML.search('matrix');
    if (transformIndex > 0) {
      transform = /matrix\(.+\)/g.exec(element.outerHTML)[0];
    } else {
      return 0;
    }
  }
  // A transform looks like matrix(a, b, c, d, tx, ty). We want tx.
  return parseFloat(transform.split(',')[4]);
};

const setTextAndFireInputEvent = function(text: string,
    textArea: HTMLTextAreaElement): void {
  textArea.value = text;
  textArea.dispatchEvent(new Event('input', {
    'bubbles': true,
    'cancelable': false
  }));
};

// TODO: Add variations of this for accessibility testing (enter key and
// spacebar instead of click events) to make sure things work correctly
// when a user navigates through the app using the keyboard.
const sendClickEvent = function(item: HTMLElement): void {
  const event = document.createEvent('HTMLEvents');
  event.initEvent('click', false, true);
  item.dispatchEvent(event);
};

function getCopyOfDefaultDemoSettings(): DemoSettings {
  return JSON.parse(JSON.stringify(DEFAULT_DEMO_SETTINGS));
}

function getNormalizedInnerText(element: HTMLElement) {
  return element.innerText.replace(/\s+/g, ' ');
}

function verifyLoadingWidgetHasShape(checker: ConvaiCheckerComponent, expectedShape: Shape) {
  const shape = checker.statusWidget.currentShape;
  expect(shape).toEqual(expectedShape);
}

function verifyLoadingWidgetHasEmoji(checker: ConvaiCheckerComponent, expectedEmoji: Emoji) {
  const smileEmojiVisible = getIsElementWithIdVisible('smileEmoji');
  const neutralEmojiVisible = getIsElementWithIdVisible('neutralEmoji');
  const sadEmojiVisible = getIsElementWithIdVisible('sadEmoji');
  expect(smileEmojiVisible).toBe(expectedEmoji === Emoji.SMILE);
  expect(neutralEmojiVisible).toBe(expectedEmoji === Emoji.NEUTRAL);
  expect(sadEmojiVisible).toBe(expectedEmoji === Emoji.SAD);
}

function verifyCircleSquareDiamondWidgetVisible() {
  // Checks visibility of the loading icons. The circle/square/diamond
  // loading icon should be visible, and the emoji one should not.
  const circleSquareDiamondWidgetVisible =
    getIsElementWithIdVisible('circleSquareDiamondWidget');
  const emojiWidgetVisible =
    getIsElementWithIdVisible('emojiStatusWidget');
  expect(circleSquareDiamondWidgetVisible).toBe(true);
  expect(emojiWidgetVisible).toBe(false);
}

function verifyEmojiWidgetVisible() {
  // Checks visibility of the loading icons. The emoji loading icon should be
  // visible, and the circle/square/diamond one should not.
  const circleSquareDiamondWidgetVisible =
   getIsElementWithIdVisible('circleSquareDiamondWidget');
  const emojiWidgetVisible =
   getIsElementWithIdVisible('emojiStatusWidget');
  expect(circleSquareDiamondWidgetVisible).toBe(false);
  expect(emojiWidgetVisible).toBe(true);
}

function verifyNoLoadingIconState() {
  expect(getElementExists('circleSquareDiamondWidget')).toBe(true);
  expect(getElementExists('emojiStatusWidget')).toBe(false);
  expect(getIsElementWithIdVisible('circleSquareDiamondWidget')).toBe(false);
}

async function updateDemoSettingsAndWaitForAnimation(
    fixture: ComponentFixture<test_components.ConvaiCheckerCustomDemoSettingsComponent>,
    demoSettings: DemoSettings) {
  fixture.componentInstance.setDemoSettings(demoSettings);
  fixture.detectChanges();
  // Wait for animations triggered by changing the settings.
  const checker = fixture.componentInstance.checker;
  await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
  fixture.detectChanges();
}

function getElementOpacity(id: string): number {
  const element = document.getElementById(id);
  return parseFloat(window.getComputedStyle(element).getPropertyValue('opacity'));
}

function verifyEmojiIconsInDomWithZeroOpacity() {
  expect(getElementOpacity('smileEmoji')).toEqual(0);
  expect(getElementOpacity('neutralEmoji')).toEqual(0);
  expect(getElementOpacity('sadEmoji')).toEqual(0);
}

function waitForTimeout(ms: number): Promise<void> {
  return new Promise((re, rj) => {
    setTimeout(() => { re(); }, ms);
  });
}


// Checks that the transitions between UI layers (score information, feedback
// prompt, and feedback thanks) behave correctly during user interaction with
// the demo.
// TODO: Refactor this into smaller functions.
async function verifyLayerTransitionsWorkForDemoSiteConfig(
    fixture: ComponentFixture<test_components.ConvaiCheckerCustomDemoSettingsComponent>,
    httpMock: HttpTestingController) {
  // Note: This test doesn't test error case UI, since that is handled in
  // other tests.
  const checker = fixture.componentInstance.checker;
  const queryText = 'Your mother was a hamster';
  const checkUrl = 'test-url/check';
  const suggestScoreUrl = 'test-url/suggest_score';
  const lastRequestUrl = '';

  const layer1TextElements = [
    'perceived as toxic',
    'DISAGREE?'
  ];
  const layer1VisibleElementIds = ['layer1', 'seemWrongButtonDemoConfig'];
  const layer1HiddenElementIds = ['layer2', 'layer3'];
  const layer2TextElements = [
    'Is this comment toxic?',
    'YES',
    'NO',
  ];
  const layer2VisibleElementIds = ['layer2', 'yesButtonDemoConfig', 'noButtonDemoConfig'];
  const layer2HiddenElementIds = ['layer1', 'layer3'];
  const layer3TextElements = [
    'Thanks for your feedback!',
  ];
  const layer3VisibleElementIds = ['layer3', 'feedbackThanksDemoConfig'];
  const layer3HiddenElementIds = ['layer1', 'layer2'];

  const textArea = fixture.debugElement.query(
    By.css('#' + checker.inputId)).nativeElement;

  // Step 1: Send an input event to trigger the check call.
  setTextAndFireInputEvent(queryText, textArea);

  await waitForTimeout(REQUEST_LIMIT_MS);

  const mockReq = httpMock.expectOne('test-url/check');
  expect(checker.statusWidget.isLoading).toBe(true);

  mockReq.flush(getMockCheckerResponse(0.5, queryText));
  fixture.detectChanges();

  // Step 2: Check layer 1 UI.
  for (const text of layer1TextElements) {
    expect(getNormalizedInnerText(fixture.nativeElement)).toContain(text);
  }
  for (const elementId of layer1VisibleElementIds) {
    expect(getIsElementWithIdVisible(elementId)).toBe(true);
  }
  for (const elementId of layer1HiddenElementIds) {
    expect(getIsElementWithIdVisible(elementId)).toBe(false);
  }

  // Step 3: Click the seem wrong button.
  const seemWrongButton = document.getElementById('seemWrongButtonDemoConfig');
  sendClickEvent(seemWrongButton);
  await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
  fixture.detectChanges();

  // Step 4: Check layer 2 UI.
  for (const text of layer2TextElements) {
    expect(getNormalizedInnerText(fixture.nativeElement)).toContain(text);
  }
  for (const elementId of layer2VisibleElementIds) {
    expect(getIsElementWithIdVisible(elementId)).toBe(true);
  }
  for (const elementId of layer2HiddenElementIds) {
    expect(getIsElementWithIdVisible(elementId)).toBe(false);
  }

  // Step 5: Send feedback by pressing the yes button to move to layer 3.
  sendClickEvent(document.getElementById('yesButtonDemoConfig'));
  fixture.detectChanges();

  const mockSuggestReq = httpMock.expectOne('test-url/suggest_score');
  expect(fixture.nativeElement.textContent).not.toContain('Yes');
  expect(fixture.nativeElement.textContent).not.toContain('No');

  mockSuggestReq.flush({clientToken: 'token'});
  await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
  fixture.detectChanges();

  // Step 6: Check layer 3 UI.
  for (const text of layer3TextElements) {
    expect(getNormalizedInnerText(fixture.nativeElement)).toContain(text);
  }
  for (const elementId of layer3VisibleElementIds) {
    expect(getIsElementWithIdVisible(elementId)).toBe(true);
  }
  for (const elementId of layer3HiddenElementIds) {
    expect(getIsElementWithIdVisible(elementId)).toBe(false);
  }

  // Step 7: Return to layer 1 and check UI again.
  const thanksButton = document.getElementById('thanksForFeedbackButtonDemoConfig');
  sendClickEvent(thanksButton);
  await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
  fixture.detectChanges();

  for (const text of layer1TextElements) {
    expect(getNormalizedInnerText(fixture.nativeElement)).toContain(text);
  }
  for (const elementId of layer1VisibleElementIds) {
    expect(getIsElementWithIdVisible(elementId)).toBe(true);
  }
  for (const elementId of layer1HiddenElementIds) {
    expect(getIsElementWithIdVisible(elementId)).toBe(false);
  }
}

// Checks that colors are almost equal within some distance margin in the rgb
// colorspace to account for floating point calculation errors in the gradient
// calculation.
function verifyColorsAlmostEqual(color1: string, color2: string, maxDistance = 1) {
  const rgb1 = d3.rgb(color1);
  const rgb2 = d3.rgb(color2);
  expect(Math.sqrt(Math.pow(rgb1.r - rgb2.r, 2)
                   + Math.pow(rgb1.g - rgb2.g, 2)
                   + Math.pow(rgb1.b - rgb2.b, 2)))
    .toBeLessThanOrEqual(maxDistance);
}

// Checks that the interpolateColors function provides the correct value at
// gradient control points.
function verifyInterpolateColorsForControlPointsAndGradientColors(
  checker: ConvaiCheckerComponent, controlPoints: number[],
  gradientColorsRgb: string[]) {
  console.log(controlPoints);
  console.log(gradientColorsRgb);
  for (let i = 0; i < controlPoints.length; i++) {
    verifyColorsAlmostEqual(
      checker.statusWidget.interpolateColors(controlPoints[i] / 100),
      gradientColorsRgb[i]);
  }
}

// Checks that the loading icon/widget visibility and feedback visibility are
// correct given the settings.
//
// TODO: If this function is called more than once from within an individual
// test, we get an error: 'Connection has already been resolved.' Investigate
// why.
async function verifyWidgetVisibilityForDemoSettings(
    fixture: ComponentFixture<test_components.ConvaiCheckerCustomDemoSettingsComponent>,
    httpMock: HttpTestingController,
    demoSettings: DemoSettings,
    mockResponseScores: number[],
    expectedWidgetVisibilitiesBeforeLoading: boolean[],
    expectedWidgetVisibilitiesWhileLoading: boolean[],
    expectedWidgetVisibilitiesAfterLoading: boolean[],
    expectedFeedbackTextVisibilitiesAfterLoading: boolean[],
    widgetId = 'circleSquareDiamondWidget',
    textFeedbackElementId = 'layerText') {
  const checker = fixture.componentInstance.checker;
  const textArea = fixture.debugElement.query(
    By.css('#' + checker.inputId)).nativeElement;

  // Set up the mock responses for the series of requests that will be
  // made in the test.
  const queryTexts = [];
  const expectedFeedbackText = [];
  for (let i = 0; i < mockResponseScores.length; i++) {
    queryTexts.push(`Text ${i}`);
    expectedFeedbackText.push(checker.statusWidget.getFeedbackTextForScore(mockResponseScores[i]));
  }

  // Wait for animation triggered in ngAfterViewInit.
  await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();

  // Test steps:
  // 1. Update settings
  await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);

  for (let callCount = 0; callCount < mockResponseScores.length; callCount++) {
    fixture.detectChanges();

    // Check visibility before loading.
    expect(getIsElementWithIdVisible(widgetId))
      .toBe(expectedWidgetVisibilitiesBeforeLoading[callCount]);

    // Run query and check visibility.
    setTextAndFireInputEvent(queryTexts[callCount], textArea);

    await waitForTimeout(REQUEST_LIMIT_MS);

    const mockReq = httpMock.expectOne('test-url/check');
    fixture.detectChanges();
    expect(checker.statusWidget.isLoading).toBe(true);
    expect(getIsElementWithIdVisible(widgetId))
      .toBe(expectedWidgetVisibilitiesWhileLoading[callCount]);

    mockReq.flush(
      getMockCheckerResponse(mockResponseScores[callCount], queryTexts[callCount]));

    await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
    fixture.detectChanges();

    // Checks that loading has stopped.
    expect(checker.statusWidget.isLoading).toBe(false);
    expect(getIsElementWithIdVisible(widgetId))
      .toBe(expectedWidgetVisibilitiesAfterLoading[callCount]);

    // Checks that if the widget is hidden, its x value in the transform is
    // negative (it translated to the left), and that the text feedback
    // element also translated to the left.
    const widgetXTranslation = getElementXTranslation(widgetId);
    const feedbackTextXTranslation = getElementXTranslation(textFeedbackElementId);
    expect(widgetXTranslation).toEqual(feedbackTextXTranslation);
    if (!expectedWidgetVisibilitiesAfterLoading[callCount]) {
      expect(widgetXTranslation).toBeLessThan(0);
      expect(feedbackTextXTranslation).toBeLessThan(0);
    } else {
      expect(widgetXTranslation).toBe(0);
      expect(feedbackTextXTranslation).toBe(0);
    }

    if (expectedFeedbackTextVisibilitiesAfterLoading[callCount]) {
      expect(getNormalizedInnerText(fixture.nativeElement)).toContain(
        expectedFeedbackText[callCount]);
    } else {
      expect(getNormalizedInnerText(fixture.nativeElement)).not.toContain(
        expectedFeedbackText[callCount]);
    }
  }
}

describe('Convai checker test', () => {
  const ORIGINAL_TIMEOUT = jasmine.DEFAULT_TIMEOUT_INTERVAL;
  const INCREASED_TIMEOUT_IN_MS = 25000;

  let injector: TestBed;
  let service: PerspectiveApiService;
  let httpMock: HttpTestingController;

  /** Set up the test bed */
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        test_components.TestComponentsModule
      ],
      providers: [PerspectiveApiService],
    });

    injector = getTestBed();
    service = injector.get(PerspectiveApiService);
    httpMock = injector.get(HttpTestingController);

    TestBed.compileComponents();

    // Because of the animation involved, many tests take longer than usual. So
    // we increase the timeout.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = INCREASED_TIMEOUT_IN_MS;
  });

  afterEach(() => {
    // Make sure there are no more outstanding HTTP requests.
    httpMock.verify();
    // Return to normal timeout.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = ORIGINAL_TIMEOUT;
  });

  // TODO: Is it possible to add a test for the Angular element use case?

  it('should recognize inputs from angular input bindings', async(() => {
    const fixture =
      TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.communityId = 'testCommunityId';
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();

    const checker = fixture.componentInstance.checker;

    expect(checker.serverUrl).toEqual('test-url');
    expect(checker.inputId).toEqual('checkerTextarea');
    expect(checker.demoSettings.communityId).toEqual('testCommunityId');
  }));

  it('check default demo settings', async(() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerNoDemoSettingsComponent);
    fixture.detectChanges();

    const checker = fixture.componentInstance.checker;

    expect(checker.serverUrl).toEqual('test-url');
    expect(checker.inputId).toEqual('checkerTextarea');
    expect(checker.demoSettings).toEqual(DEFAULT_DEMO_SETTINGS);

  }));

  it('should show an error if no textarea id is specified', async(() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerNoInputComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Error');
  }));

  it('should show an error if textarea id is missing', async(() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerMissingInputIdComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Error');
  }));

  it('Should analyze comment and store and emit response', async () => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const queryText = 'Your mother was a hamster';

    const mockScore = 0.3;
    const mockResponse: AnalyzeCommentResponse =
      getMockCheckerResponse(mockScore, queryText);

    let lastEmittedResponse: AnalyzeCommentResponse|null = null;
    let lastEmittedScore = -1;
    let emittedResponseCount = 0;
    let emittedScoreCount = 0;

    // Records when the response is emitted.
    checker.analyzeCommentResponseChanged.subscribe(
      (emittedItem: AnalyzeCommentResponse|null) => {
        lastEmittedResponse = emittedItem;
        emittedResponseCount++;
    });

    // Records when the score is emitted.
    checker.scoreChanged.subscribe((emittedScore: number) => {
      lastEmittedScore = emittedScore;
      emittedScoreCount++;
    });

    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    // Send an input event to trigger the service call.
    setTextAndFireInputEvent(queryText, textArea);

    await waitForTimeout(REQUEST_LIMIT_MS);

    // Expect a request to have been sent.
    const mockReq = httpMock.expectOne('test-url/check');

    // Once a request is in flight, loading is set to true.
    expect(checker.analyzeCommentResponse).toBe(null);
    expect(checker.statusWidget.isLoading).toBe(true);

    // Now we have checked the expectations before the response is sent, we
    // send back the response.
    mockReq.flush(mockResponse);

    await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();

    // Checks that the response is received and stored.
    expect(checker.analyzeCommentResponse).not.toBe(null);
    expect(checker.analyzeCommentResponse).toEqual(mockResponse);

    // Checks that the response was emitted.
    expect(lastEmittedResponse).toEqual(mockResponse);
    expect(emittedResponseCount).toEqual(1);

    // Checks that the score was emitted.
    expect(lastEmittedScore).toEqual(mockScore);
    expect(emittedScoreCount).toEqual(1);

    // Checks that loading has stopped.
    expect(checker.statusWidget.isLoading).toBe(false);
  });

  it('Should analyze comment and store and emit response, custom model', async () => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.modelName = 'OTHER_ATTRIBUTE';
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const queryText = 'Your mother was a hamster';

    const mockScore = 0.3;
    const customModelScore = 0.2;
    const mockResponse: AnalyzeCommentResponse =
      getMockCheckerResponse(mockScore, queryText, customModelScore);

    let lastEmittedResponse: AnalyzeCommentResponse|null = null;
    let lastEmittedScore = -1;
    let emittedResponseCount = 0;
    let emittedScoreCount = 0;

    // Records when the response is emitted.
    checker.analyzeCommentResponseChanged.subscribe(
      (emittedItem: AnalyzeCommentResponse|null) => {
        lastEmittedResponse = emittedItem;
        emittedResponseCount++;
    });

    // Records when the score is emitted.
    checker.scoreChanged.subscribe((emittedScore: number) => {
      lastEmittedScore = emittedScore;
      emittedScoreCount++;
    });

    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    // Send an input event to trigger the service call.
    setTextAndFireInputEvent(queryText, textArea);

    await waitForTimeout(REQUEST_LIMIT_MS);

    // Expect a request to have been sent.
    const mockReq = httpMock.expectOne('test-url/check');

    // Once a request is in flight, loading is set to true.
    expect(checker.analyzeCommentResponse).toBe(null);
    expect(checker.statusWidget.isLoading).toBe(true);

    // Now we have checked the expectations before the response is sent, we
    // send back the response.
    mockReq.flush(mockResponse);

    await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();

    // Checks that the response is received and stored.
    expect(checker.analyzeCommentResponse).not.toBe(null);
    expect(checker.analyzeCommentResponse).toEqual(mockResponse);

    // Checks that the response was emitted.
    expect(lastEmittedResponse).toEqual(mockResponse);
    expect(emittedResponseCount).toEqual(1);

    // Checks that the score was emitted.
    expect(lastEmittedScore).toEqual(customModelScore);
    expect(emittedScoreCount).toEqual(1);

    // Checks that loading has stopped.
    expect(checker.statusWidget.isLoading).toBe(false);
  });

  it('Should check score again on model change', async () => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const queryText = 'Your mother was a hamster';

    let lastEmittedResponse: AnalyzeCommentResponse|null = null;
    let lastEmittedScore = -1;
    let emittedResponseCount = 0;
    let emittedScoreCount = 0;

    // Records when the response is emitted.
    checker.analyzeCommentResponseChanged.subscribe(
      (emittedItem: AnalyzeCommentResponse|null) => {
        lastEmittedResponse = emittedItem;
        emittedResponseCount++;
    });

    // Records when the score is emitted.
    checker.scoreChanged.subscribe((emittedScore: number) => {
      lastEmittedScore = emittedScore;
      emittedScoreCount++;
    });

    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    // Send an input event to trigger the service call.
    setTextAndFireInputEvent(queryText, textArea);

    await waitForTimeout(REQUEST_LIMIT_MS);

    // Expect a request to have been sent.
    const mockReq = httpMock.expectOne('test-url/check');

    // Once a request is in flight, loading is set to true.
    expect(checker.analyzeCommentResponse).toBe(null);
    expect(checker.statusWidget.isLoading).toBe(true);

    // Now we have checked the expectations before the response is sent, we
    // send back the response.
    const mockResponse: AnalyzeCommentResponse =
      getMockCheckerResponse(0.3, queryText);
    mockReq.flush(mockResponse);

    await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();

    // Checks that the response is received and stored.
    expect(checker.analyzeCommentResponse).not.toBe(null);
    expect(checker.analyzeCommentResponse).toEqual(mockResponse);

    // Checks that the response was emitted.
    expect(lastEmittedResponse).toEqual(mockResponse);
    expect(emittedResponseCount).toEqual(1);

    // Checks that the score was emitted.
    expect(lastEmittedScore).toEqual(0.3);
    expect(emittedScoreCount).toEqual(1);

    // Checks that loading has stopped.
    expect(checker.statusWidget.isLoading).toBe(false);

    // Change the model.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.modelName = 'OTHER_ATTRIBUTE';
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();

    await waitForTimeout(REQUEST_LIMIT_MS);

    // Expect a request to have been sent.
    const mockReq2 = httpMock.expectOne('test-url/check');

    // Once a request is in flight, loading is set to true.
    expect(checker.analyzeCommentResponse).toBe(mockResponse); // Previous response
    expect(checker.statusWidget.isLoading).toBe(true);

    const mockResponse2 = getMockCheckerResponse(null, queryText, 0.5);
    // Now we have checked the expectations before the response is sent, we
    // send back the response.
    mockReq2.flush(mockResponse2);

    await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();

    // Checks that the response is received and stored.
    expect(checker.analyzeCommentResponse).not.toBe(null);
    expect(checker.analyzeCommentResponse).toEqual(mockResponse2);

    // Checks that the response was emitted.
    expect(lastEmittedResponse).toEqual(mockResponse2);
    expect(emittedResponseCount).toEqual(2);

    // Checks that the score was emitted.
    expect(lastEmittedScore).toEqual(0.5);
    expect(emittedScoreCount).toEqual(2);

    // Checks that loading has stopped.
    expect(checker.statusWidget.isLoading).toBe(false);
  });


  it('Should handle analyze comment error, demo config', fakeAsync(() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const queryText = 'Your mother was a hamster';

    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    // Send an input event to trigger the service call.
    setTextAndFireInputEvent(queryText, textArea);
    tick(REQUEST_LIMIT_MS);

    const mockReq = httpMock.expectOne('test-url/check');
    expect(checker.analyzeCommentResponse).toBe(null);
    expect(checker.statusWidget.isLoading).toBe(true);

    mockReq.error(new ErrorEvent('Check failed!'));
    tick();

    fixture.detectChanges();
    // Checks that the error message is displayed.
    expect(checker.analyzeCommentResponse).toBe(null);
    expect(fixture.nativeElement.textContent).toContain('Please try again later');

    // Checks that loading has stopped.
    expect(checker.statusWidget.isLoading).toBe(false);
  }));

  it('Should not make duplicate analyze comment requests', fakeAsync(() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const queryText = 'Your mother was a hamster';

    const mockResponse: AnalyzeCommentResponse = getMockCheckerResponse(0.5, queryText);

    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    // Send an input event to trigger the service call.
    setTextAndFireInputEvent(queryText, textArea);

    tick(REQUEST_LIMIT_MS);

    // Expect a request to have been sent.
    const mockReq = httpMock.expectOne('test-url/check');

    // Once a request is in flight, loading is set to true.
    tick();
    expect(checker.analyzeCommentResponse).toBe(null);
    expect(checker.statusWidget.isLoading).toBe(true);

    // Now we have checked the expectations before the response is sent, we
    // send back the response.
    mockReq.flush(mockResponse);
    tick();

    // Checks that the response is received and stored.
    expect(checker.analyzeCommentResponse).not.toBe(null);
    expect(checker.analyzeCommentResponse).toEqual(mockResponse);
    expect(checker.statusWidget.isLoading).toBe(false);

    // Send another input event. This should not trigger another analyze
    // call since the text is the same.
    setTextAndFireInputEvent(queryText, textArea);
    tick(REQUEST_LIMIT_MS);
    httpMock.expectNone('test-url/check');
  }));

  it('Should update UI for sending score feedback, demo config ', fakeAsync(() => {
    const fixture =
      TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();

    const checker = fixture.componentInstance.checker;
    const queryText = 'Your mother was a hamster';
    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    // Send an input event to trigger the service call.
    setTextAndFireInputEvent(queryText, textArea);

    tick(REQUEST_LIMIT_MS);

    // Expect a request to have been sent.
    const mockReq = httpMock.expectOne('test-url/check');

    // Once a request is in flight, loading is set to true.
    expect(checker.statusWidget.isLoading).toBe(true);

    // Now we have checked the expectations before the response is sent, we
    // send back the response.
    mockReq.flush(getMockCheckerResponse(0.5, queryText));
    tick();
    fixture.detectChanges();

    // Checks that loading has stopped.
    expect(checker.statusWidget.isLoading).toBe(false);

    // Click the 'Disagree?' button
    const seemWrongButton = document.getElementById('seemWrongButtonDemoConfig');
    sendClickEvent(seemWrongButton);

    // Wait for the UI to update, then click the 'Yes' button
    tick();
    fixture.detectChanges();
    sendClickEvent(document.getElementById('yesButtonDemoConfig'));

    const mockSuggestReq = httpMock.expectOne('test-url/suggest_score');

    tick();
    fixture.detectChanges();

    // The yes and no buttons should have disappeared while the request is
    // in progress.
    expect(fixture.nativeElement.textContent).not.toContain('Yes');
    expect(fixture.nativeElement.textContent).not.toContain('No');

    mockSuggestReq.flush({clientToken: 'token'});

    tick();
    fixture.detectChanges();

    // Confirm the UI state after feedback is submitted.
    expect(fixture.nativeElement.textContent).toContain('Thanks');

    httpMock.verify();
  }));

  it('Should not make suggest score request after text has been cleared, demo config',
     fakeAsync(() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;

    const checkUrl = 'test-url/check';
    const suggestScoreUrl = 'test-url/suggest_score';
    const lastRequestUrl = '';
    const queryText = 'Your mother was a hamster';
    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    // 1) Fire an event to trigger a check request.
    setTextAndFireInputEvent(queryText, textArea);

    tick(REQUEST_LIMIT_MS);

    const mockReq = httpMock.expectOne('test-url/check');

    expect(checker.statusWidget.isLoading).toBe(true);

    mockReq.flush(getMockCheckerResponse(0.5, queryText));
    tick();
    fixture.detectChanges();

    expect(checker.statusWidget.isLoading).toBe(false);

    // Seem wrong button should be displayed.
    expect(fixture.nativeElement.textContent).toContain('Disagree?');

    // 2) After the first check compconstes, send an event that the
    // textbox has been cleared.
    setTextAndFireInputEvent('', textArea);
    tick(REQUEST_LIMIT_MS);
    httpMock.expectNone('test-url/check');

    fixture.detectChanges();

    // Sanity check -- seems wrong button should not be displayed.
    expect(fixture.nativeElement.textContent).not.toContain('Disagree?');

    // 3) Try to leave feedback for the empty string anyway, to make sure it
    // does not go through. This state should not be possible but we
    // want to guard against it.
    const commentFeedback: CommentFeedback = {
      commentMarkedAsToxic: true
    };
    checker.onCommentFeedbackReceived(commentFeedback);

    tick();
    httpMock.expectNone('test-url/suggest_score');
  }));

  it('Handles feedback error', async() => {
    const fixture =
      TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();

    const checker = fixture.componentInstance.checker;

    const checkUrl = 'test-url/check';
    const suggestScoreUrl = 'test-url/suggest_score';
    const lastRequestUrl = '';
    const queryText = 'Your mother was a hamster';

    // Sets up mock responses for the check and suggest score calls.
    const mockResponses: { [key: string]: Object } = {};
    mockResponses[checkUrl] = getMockCheckerResponse(0.5, queryText);

    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    // Send an input event to trigger the service call.
    setTextAndFireInputEvent(queryText, textArea);
    await waitForTimeout(REQUEST_LIMIT_MS);

    const mockReq = httpMock.expectOne('test-url/check');
    expect(checker.statusWidget.isLoading).toBe(true);

    mockReq.flush(getMockCheckerResponse(0.5, queryText));
    fixture.detectChanges();
    await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
    expect(checker.statusWidget.isLoading).toBe(false);

    const seemWrongButton = document.getElementById('seemWrongButtonDemoConfig');
    sendClickEvent(seemWrongButton);
    await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
    fixture.detectChanges();

    sendClickEvent(document.getElementById('yesButtonDemoConfig'));
    fixture.detectChanges();

    const mockSuggestReq = httpMock.expectOne('test-url/suggest_score');
    expect(fixture.nativeElement.textContent).not.toContain('Yes');
    expect(fixture.nativeElement.textContent).not.toContain('No');
    mockSuggestReq.error(new ErrorEvent('error'));

    fixture.detectChanges();
    await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
    expect(fixture.nativeElement.textContent).not.toContain('Thanks');
    expect(fixture.nativeElement.textContent).toContain('Error');
  });

  it('Should handle manual check', fakeAsync(() => {
    const fixture =
      TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();

    const checker = fixture.componentInstance.checker;

    const queryText = 'Your mother was a hamster';
    const mockResponseBody = getMockCheckerResponse(0.5, queryText);

    // Keeps track of the emitted response.
    let lastEmittedResponse: AnalyzeCommentResponse|null = null;
    let emittedResponseCount = 0;
    checker.analyzeCommentResponseChanged.subscribe(
      (emittedItem: AnalyzeCommentResponse|null) => {
        lastEmittedResponse = emittedItem;
        emittedResponseCount++;
    });

    // Before a request is sent, isLoading is false.
    expect(checker.analyzeCommentResponse).toBe(null);
    expect(checker.statusWidget.isLoading).toBe(false);

    // Make a request.
    checker.checkText(queryText);
    tick(REQUEST_LIMIT_MS);
    // Expect a request to have been sent.
    const mockReq = httpMock.expectOne('test-url/check');

    // Once a request is in flight, loading is set to true.
    tick();
    expect(checker.analyzeCommentResponse).toBe(null);
    expect(checker.statusWidget.isLoading).toBe(true);

    // Now we have checked the expectations before the response is sent, we
    // send back the response.
    mockReq.flush(mockResponseBody);
    tick();

    // Checks that the response is received and stored.
    expect(checker.analyzeCommentResponse).toEqual(mockResponseBody);
    // Checks that exactly one response is emitted.
    expect(lastEmittedResponse).toEqual(mockResponseBody);
    expect(emittedResponseCount).toEqual(1);
    // make sure that loading has now ended.
    expect(checker.statusWidget.isLoading).toBe(false);
  }));

  it('Should handle UI layer changes, demo config, emoji loading icon style',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);

    // Configure settings.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();

    await verifyLayerTransitionsWorkForDemoSiteConfig(fixture, httpMock);
  });

  it('Should handle UI layer changes, demo config, circle/square/diamond loading',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();

    const checker = fixture.componentInstance.checker;
    await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();

    await verifyLayerTransitionsWorkForDemoSiteConfig(fixture, httpMock);
  });

  it('Should handle UI layer changes, demo config, no loading icon',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);

    // Configure settings.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.loadingIconStyle = LoadingIconStyle.NONE;
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();

    const checker = fixture.componentInstance.checker;
    await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();

    await verifyLayerTransitionsWorkForDemoSiteConfig(fixture, httpMock);
  });

  it('Test loading icon visibility with setting showFeedbackForLowScores = false',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);

    // Configure settings.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.4;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = false;
    fixture.componentInstance.setDemoSettings(demoSettings);

    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const queryTexts = [
      'Your mother was a hamster',
      'Your father smelled of elderberries',
      'What is the air velocity of an unladen swallow?'
    ];

    const mockResponses = [
      getMockCheckerResponse(0.2, queryTexts[0]),
      getMockCheckerResponse(0.5, queryTexts[1]),
      getMockCheckerResponse(0.2, queryTexts[2])
    ];

    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    for (let callCount = 0; callCount < mockResponses.length; callCount++) {
      // Send an input event to trigger the service call.
      setTextAndFireInputEvent(queryTexts[callCount], textArea);

      await waitForTimeout(REQUEST_LIMIT_MS);

      const mockReq = httpMock.expectOne('test-url/check');
      fixture.detectChanges();
      expect(getIsElementWithIdVisible('circleSquareDiamondWidget')).toBe(false);
      expect(checker.statusWidget.isLoading).toBe(true);

      mockReq.flush(mockResponses[callCount]);

      await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
      fixture.detectChanges();

      // Checks that loading has stopped.
      expect(checker.statusWidget.isLoading).toBe(false);
      expect(checker.statusWidget.isPlayingLoadingAnimation).toBe(false);

      let statusWidgetVisible = getIsElementWithIdVisible('circleSquareDiamondWidget');
      // The first and third responses (indices 0 and 2) have a score below
      // the neutral threshold, so the loading widget should only be visible for
      // the second one (index 1).
      expect(statusWidgetVisible).toBe(callCount === 1);

      setTextAndFireInputEvent('', textArea);

      // Checks that clearing the textbox hides the status widget.
      await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
      fixture.detectChanges();
      statusWidgetVisible = getIsElementWithIdVisible('circleSquareDiamondWidget');
      expect(statusWidgetVisible).toBe(false);
    }
  });

  it('Test loading icon visibility with setting showFeedbackForNeutralScores = false',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);

    // Configure settings.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.4;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForNeutralScores = false;
    fixture.componentInstance.setDemoSettings(demoSettings);

    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const queryTexts = [
      'Your mother was a hamster',
      'Your father smelled of elderberries',
      'What is the air velocity of an unladen swallow?',
      'She\'s a witch!'
    ];

    const mockResponses = [
      getMockCheckerResponse(0.2, queryTexts[0]),
      getMockCheckerResponse(0.4, queryTexts[1]),
      getMockCheckerResponse(0.8, queryTexts[2]),
      getMockCheckerResponse(0.5, queryTexts[3])
    ];

    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    for (let callCount = 0; callCount < mockResponses.length; callCount++) {
      // Send an input event to trigger the service call.
      setTextAndFireInputEvent(queryTexts[callCount], textArea);

      await waitForTimeout(REQUEST_LIMIT_MS);

      const mockReq = httpMock.expectOne('test-url/check');
      fixture.detectChanges();

      // Because we clear the textbox between loop iterations, this defaults the
      // score back to 0, so the widget will be visible even after a neutral
      // score.
      expect(getIsElementWithIdVisible('circleSquareDiamondWidget')).toBe(true);
      expect(checker.statusWidget.isLoading).toBe(true);

      mockReq.flush(mockResponses[callCount]);

      await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
      fixture.detectChanges();

      // Checks that loading has stopped.
      expect(checker.statusWidget.isLoading).toBe(false);
      expect(checker.statusWidget.isPlayingLoadingAnimation).toBe(false);

      let statusWidgetVisible = getIsElementWithIdVisible('circleSquareDiamondWidget');
      // The second and fourth responses (indices 1 and 3) have scores in the
      // neutral range and should be hidden.
      expect(statusWidgetVisible).toBe(callCount === 0 || callCount === 2);

      setTextAndFireInputEvent('', textArea);

      // Checks that clearing the textbox does not hide the status widget.
      await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
      fixture.detectChanges();
      statusWidgetVisible = getIsElementWithIdVisible('circleSquareDiamondWidget');
      expect(statusWidgetVisible).toBe(true);
    }
  });

  it('Test circle square diamond change for score thresholds', async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);

    // Configure settings.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.loadingIconStyle = LoadingIconStyle.CIRCLE_SQUARE_DIAMOND;
    fixture.componentInstance.setDemoSettings(demoSettings);

    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    // Set up the mock responses for the series of three requests that will be
    // made in the test.
    const queryTexts = [
      'Your mother was a hamster',
      'Your father smelled of elderberries',
      'What is the air velocity of an unladen swallow?'
    ];

    const mockResponses = [
      getMockCheckerResponse(0.9, queryTexts[0]),
      getMockCheckerResponse(0.7, queryTexts[1]),
      getMockCheckerResponse(0.2, queryTexts[2])
    ];
    // For each of the mock responses, the thresholds should indicate a
    // different loading icon shape.
    const expectedShapes = [
      Shape.DIAMOND,
      Shape.SQUARE,
      Shape.CIRCLE
    ];

    verifyCircleSquareDiamondWidgetVisible();

    for (let callCount = 0; callCount < mockResponses.length; callCount++) {
      // Send an input event to trigger the service call.
      setTextAndFireInputEvent(queryTexts[callCount], textArea);

      await waitForTimeout(REQUEST_LIMIT_MS);

      const mockReq = httpMock.expectOne('test-url/check');

      fixture.detectChanges();
      // Check the UI state before returning the repsonse.
      verifyCircleSquareDiamondWidgetVisible();
      expect(checker.statusWidget.isLoading).toBe(true);

      mockReq.flush(mockResponses[callCount]);

      await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
      // Checks the UI state after the response has been received.

      // Checks that loading has stopped.
      expect(checker.statusWidget.isLoading).toBe(false);
      expect(checker.statusWidget.isPlayingLoadingAnimation).toBe(false);

      verifyCircleSquareDiamondWidgetVisible();
      verifyLoadingWidgetHasShape(checker, expectedShapes[callCount]);
    }
  });

  it('Test emoji change for score thresholds', async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);

    // Configure settings.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
    console.log(demoSettings);
    fixture.componentInstance.setDemoSettings(demoSettings);

    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    // Set up the mock responses for the series of three requests that will be
    // made in the test.
    const queryTexts = [
      'Your mother was a hamster',
      'Your father smelled of elderberries',
      'What is the air velocity of an unladen swallow?'
    ];

    const mockResponses = [
      getMockCheckerResponse(0.9, queryTexts[0]),
      getMockCheckerResponse(0.7, queryTexts[1]),
      getMockCheckerResponse(0.2, queryTexts[2])
    ];
    // For each of the mock responses, the thresholds should indicate a
    // different emoji.
    const expectedEmojis = [
      Emoji.SAD,
      Emoji.NEUTRAL,
      Emoji.SMILE,
    ];

    verifyEmojiWidgetVisible();

    for (let callCount = 0; callCount < mockResponses.length; callCount++) {
      // Send an input event to trigger the service call.
      setTextAndFireInputEvent(queryTexts[callCount], textArea);
      await waitForTimeout(REQUEST_LIMIT_MS);

      const mockReq = httpMock.expectOne('test-url/check');
      // Check the UI state before returning the repsonse.

      verifyEmojiWidgetVisible();

      // TODO: Figure out how to 'fast-forward' the state of the animation in
      // the test environment without messing up the other test state, and then
      // uncomment the code below to check the opacity of the emoji icons here.
      // verifyEmojiIconsInDomWithZeroOpacity();

      expect(checker.statusWidget.isLoading).toBe(true);

      mockReq.flush(mockResponses[callCount]);

      await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
      fixture.detectChanges();
      // Checks the UI state after the response has been received.

      // Checks that loading has stopped.
      expect(checker.statusWidget.isLoading).toBe(false);
      expect(checker.statusWidget.isPlayingLoadingAnimation).toBe(false);

      verifyEmojiWidgetVisible();
      verifyLoadingWidgetHasEmoji(checker, expectedEmojis[callCount]);
    }
  });

  it('Test loading icon style setting change. Circle square diamond to emoji',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);

    // Configure settings.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.loadingIconStyle = LoadingIconStyle.CIRCLE_SQUARE_DIAMOND;
    fixture.componentInstance.setDemoSettings(demoSettings);

    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    const queryTexts = [
      'Your mother was a hamster',
      'Your father smelled of elderberries',
      'What is the air velocity of an unladen swallow?'
    ];

    const mockResponses = [
      getMockCheckerResponse(0.9, queryTexts[0]),
      getMockCheckerResponse(0.7, queryTexts[1]),
      getMockCheckerResponse(0.2, queryTexts[2])
    ];
    // For each of the mock responses, the thresholds should indicate a
    // different loading icon shape.
    const expectedShapes = [
      Shape.DIAMOND, Shape.SQUARE, Shape.CIRCLE
    ];
    // For each of the mock responses, the thresholds should indicate a
    // different emoji.
    const expectedEmojis = [
      Emoji.SAD, Emoji.NEUTRAL, Emoji.SMILE
    ];

    verifyCircleSquareDiamondWidgetVisible();

    for (let callCount = 0; callCount < mockResponses.length; callCount++) {
      // Send an input event to trigger the service call.
      setTextAndFireInputEvent(queryTexts[callCount], textArea);
      await waitForTimeout(REQUEST_LIMIT_MS);

      const mockReq = httpMock.expectOne('test-url/check');

      fixture.detectChanges();
      // Check the UI state before returning the repsonse.
      verifyCircleSquareDiamondWidgetVisible();
      expect(checker.statusWidget.isLoading).toBe(true);
      mockReq.flush(mockResponses[callCount]);

      // Wait for async code to compconste.
      await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
      fixture.detectChanges();
      // Checks the UI state after the response has been received.

      // Checks that loading has stopped.
      expect(checker.statusWidget.isLoading).toBe(false);
      expect(checker.statusWidget.isPlayingLoadingAnimation).toBe(false);

      verifyCircleSquareDiamondWidgetVisible();
      verifyLoadingWidgetHasShape(checker, expectedShapes[callCount]);

      // Change to the emoji style, and verify the loading icon visibility
      // change.
      demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
      await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);

      verifyEmojiWidgetVisible();
      verifyLoadingWidgetHasEmoji(checker, expectedEmojis[callCount]);

      // Set demo settings back to circle/square/diamond.
      demoSettings.loadingIconStyle = LoadingIconStyle.CIRCLE_SQUARE_DIAMOND;
      await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    }
  });

  it('Test loading icon style setting change. Emoji to circle square diamond',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);

    // Configure settings.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
    fixture.componentInstance.setDemoSettings(demoSettings);

    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    const queryTexts = [
      'Your mother was a hamster',
      'Your father smelled of elderberries',
      'What is the air velocity of an unladen swallow?'
    ];

    const mockResponses = [
      getMockCheckerResponse(0.9, queryTexts[0]),
      getMockCheckerResponse(0.7, queryTexts[1]),
      getMockCheckerResponse(0.2, queryTexts[2])
    ];
    // For each of the mock responses, the thresholds should indicate a
    // different emoji.
    const expectedEmojis = [
      Emoji.SAD, Emoji.NEUTRAL, Emoji.SMILE
    ];
    // For each of the mock responses, the thresholds should indicate a
    // different loading icon shape.
    const expectedShapes = [
      Shape.DIAMOND, Shape.SQUARE, Shape.CIRCLE
    ];

    verifyEmojiWidgetVisible();

    for (let callCount = 0; callCount < mockResponses.length; callCount++) {
      // Send an input event to trigger the service call.
      setTextAndFireInputEvent(queryTexts[callCount], textArea);

      await waitForTimeout(REQUEST_LIMIT_MS);

      const mockReq = httpMock.expectOne('test-url/check');

      fixture.detectChanges();
      // Check the UI state before returning the repsonse.
      verifyEmojiWidgetVisible();
      expect(checker.statusWidget.isLoading).toBe(true);
      mockReq.flush(mockResponses[callCount]);

      // Wait for async code to complete.
      await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
      fixture.detectChanges();
      // Checks the UI state after the response has been received.

      // Checks that loading has stopped.
      expect(checker.statusWidget.isLoading).toBe(false);
      expect(checker.statusWidget.isPlayingLoadingAnimation).toBe(false);

      verifyEmojiWidgetVisible();
      verifyLoadingWidgetHasEmoji(checker, expectedEmojis[callCount]);

      // Change to the shape style, and verify the loading icon visibility
      // change.
      demoSettings.loadingIconStyle = LoadingIconStyle.CIRCLE_SQUARE_DIAMOND;
      await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);

      verifyCircleSquareDiamondWidgetVisible();
      verifyLoadingWidgetHasShape(checker, expectedShapes[callCount]);

      // Set loading icon back to EMOJI style.
      demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
      await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    }
  });

  it('Test loading icon style setting change: from visible LoadingIconStyles to NONE and back',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);

    // Configure settings.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.loadingIconStyle = LoadingIconStyle.CIRCLE_SQUARE_DIAMOND;
    fixture.componentInstance.setDemoSettings(demoSettings);

    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;
    const textArea = fixture.debugElement.query(
      By.css('#' + checker.inputId)).nativeElement;

    const queryTexts = [
      'Your mother was a hamster',
      'Your father smelled of elderberries',
      'What is the air velocity of an unladen swallow?'
    ];

    const mockResponses = [
      getMockCheckerResponse(0.9, queryTexts[0]),
      getMockCheckerResponse(0.7, queryTexts[1]),
      getMockCheckerResponse(0.2, queryTexts[2])
    ];
    // For each of the mock responses, the thresholds should indicate a
    // different emoji.
    const expectedEmojis = [
      Emoji.SAD, Emoji.NEUTRAL, Emoji.SMILE
    ];
    // For each of the mock responses, the thresholds should indicate a
    // different loading icon shape.
    const expectedShapes = [
      Shape.DIAMOND, Shape.SQUARE, Shape.CIRCLE
    ];

    verifyCircleSquareDiamondWidgetVisible();

    for (let callCount = 0; callCount < mockResponses.length; callCount++) {
      // Send an input event to trigger the service call.
      setTextAndFireInputEvent(queryTexts[callCount], textArea);

      await waitForTimeout(REQUEST_LIMIT_MS);

      const mockReq = httpMock.expectOne('test-url/check');

      fixture.detectChanges();
      // Check the UI state before returning the repsonse.
      verifyCircleSquareDiamondWidgetVisible();
      expect(checker.statusWidget.isLoading).toBe(true);
      mockReq.flush(mockResponses[callCount]);

      // Wait for async code to complete.
      await checker.statusWidget.animationsDone.pipe(take(1)).toPromise();
      fixture.detectChanges();
      // Checks the UI state after the response has been received.

      // Checks that loading has stopped.
      expect(checker.statusWidget.isLoading).toBe(false);
      expect(checker.statusWidget.isPlayingLoadingAnimation).toBe(false);

      verifyCircleSquareDiamondWidgetVisible();
      verifyLoadingWidgetHasShape(checker, expectedShapes[callCount]);

      // Change to the NONE style, and verify the loading icon visibility
      // change.
      demoSettings.loadingIconStyle = LoadingIconStyle.NONE;
      await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);

      verifyNoLoadingIconState();

      // Change to the EMOJI style.
      demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
      await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);

      verifyEmojiWidgetVisible();
      verifyLoadingWidgetHasEmoji(checker, expectedEmojis[callCount]);

      // Change back to the NONE style, and verify the loading icon visibility
      // change.
      demoSettings.loadingIconStyle = LoadingIconStyle.NONE;
      await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);

      verifyNoLoadingIconState();

      // Change back to the CIRCLE_SQUARE_DIAMOND style.
      demoSettings.loadingIconStyle = LoadingIconStyle.CIRCLE_SQUARE_DIAMOND;
      await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    }
  });


  it('Test loading icon visibility, shows feedback for low and neutral scores ',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    // Always show feedback (the loading icon should always display).
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = true;
    demoSettings.showFeedbackForNeutralScores = true;
    const mockResponseScores = [0.6, 0, 0.9];
    const expectedWidgetVisibilitiesBeforeLoading = [true, true, true];
    const expectedWidgetVisibilitiesWhileLoading = [true, true, true];
    const expectedWidgetVisibilitiesAfterLoading = [true, true, true];
    const expectedFeedbackTextVisibilitiesAfterLoading = [true, true, true];
    const widgetId = 'circleSquareDiamondWidget';

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading);
  });

  it('Test loading icon visibility, shows feedback for low and neutral scores, emoji icon',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    // Always show feedback, (the loading icon should always display).
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = true;
    demoSettings.showFeedbackForNeutralScores = true;
    demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
    const mockResponseScores = [0.6, 0, 0.9];
    const expectedWidgetVisibilitiesBeforeLoading = [true, true, true];
    const expectedWidgetVisibilitiesWhileLoading = [true, true, true];
    const expectedWidgetVisibilitiesAfterLoading = [true, true, true];
    const expectedFeedbackTextVisibilitiesAfterLoading = [true, true, true];
    const widgetId = 'emojiStatusWidget';

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading,
      widgetId);
  });

  it('Test loading icon visibility, shows feedback for low and neutral scores, no loading icon',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    // Always show feedback, (the loading icon should always display).
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = true;
    demoSettings.showFeedbackForNeutralScores = true;
    demoSettings.loadingIconStyle = LoadingIconStyle.NONE;
    const mockResponseScores = [0.6, 0, 0.9];
    const expectedWidgetVisibilitiesBeforeLoading = [false, false, false];
    const expectedWidgetVisibilitiesWhileLoading = [false, false, false];
    const expectedWidgetVisibilitiesAfterLoading = [false, false, false];
    const expectedFeedbackTextVisibilitiesAfterLoading = [true, true, true];

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading);
  });

  it('Test loading icon visibility, hides feedback for low and neutral scores ',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = false;
    demoSettings.showFeedbackForNeutralScores = false;
    const mockResponseScores = [0.6, 0, 0.9, 0];
    const expectedWidgetVisibilitiesBeforeLoading = [false, false, false, true];
    const expectedWidgetVisibilitiesWhileLoading = [false, false, false, true];
    const expectedWidgetVisibilitiesAfterLoading = [false, false, true, false];
    const expectedFeedbackTextVisibilitiesAfterLoading = [false, false, true, false];
    const widgetId = 'circleSquareDiamondWidget';

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading);
  });

  it('Test loading icon visibility, hides feedback for low and neutral scores, emoji icon',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = false;
    demoSettings.showFeedbackForNeutralScores = false;
    demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
    const mockResponseScores = [0.6, 0, 0.9, 0];
    const expectedWidgetVisibilitiesBeforeLoading = [false, false, false, true];
    const expectedWidgetVisibilitiesWhileLoading = [false, false, false, true];
    const expectedWidgetVisibilitiesAfterLoading = [false, false, true, false];
    const expectedFeedbackTextVisibilitiesAfterLoading = [false, false, true, false];
    const widgetId = 'emojiStatusWidget';

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading,
      widgetId);
  });

  it('Test loading icon visibility, hides feedback for low and neutral scores, no loading icon',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = false;
    demoSettings.showFeedbackForNeutralScores = false;
    demoSettings.loadingIconStyle = LoadingIconStyle.NONE;
    const mockResponseScores = [0.6, 0, 0.9, 0];
    const expectedWidgetVisibilitiesBeforeLoading = [false, false, false, false];
    const expectedWidgetVisibilitiesWhileLoading = [false, false, false, false];
    const expectedWidgetVisibilitiesAfterLoading = [false, false, false, false];
    const expectedFeedbackTextVisibilitiesAfterLoading = [false, false, true, false];

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading);
  });

  it('Test loading icon visibility, showFeedbackForLowScores = false, ',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    // Hide feedback and loading icon for low scores.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = false;
    demoSettings.showFeedbackForNeutralScores = true;

    const mockResponseScores = [0.6, 0, 0.9];
    const expectedWidgetVisibilitiesBeforeLoading = [
      false, // The default score is 0, so at the start it will be hidden.
      true,
      false
    ];
    const expectedWidgetVisibilitiesWhileLoading = [false, true, false];
    const expectedWidgetVisibilitiesAfterLoading = [true, false, true];
    const expectedFeedbackTextVisibilitiesAfterLoading = [true, false, true];

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading);
  });

  it('Test loading icon visibility, showFeedbackForLowScores = false, emoji icon',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    // Show feedback above a minimum threshold, and only show loading
    // icon above the min threshold.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = false;
    demoSettings.showFeedbackForNeutralScores = true;
    demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;

    const mockResponseScores = [0.6, 0, 0.9];
    const expectedWidgetVisibilitiesBeforeLoading = [
      false, // The default score is 0, so at the start it will be hidden.
      true,
      false
    ];
    const expectedWidgetVisibilitiesWhileLoading = [false, true, false];
    const expectedWidgetVisibilitiesAfterLoading = [true, false, true];
    const expectedFeedbackTextVisibilitiesAfterLoading = [true, false, true];
    const widgetId = 'emojiStatusWidget';

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading,
      widgetId);
  });

  it('Test loading icon visibility, showFeedbackForLowScores = false, no loading icon',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    // Show feedback above a minimum threshold, and only show loading
    // icon above the min threshold.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = false;
    demoSettings.showFeedbackForNeutralScores = true;
    demoSettings.loadingIconStyle = LoadingIconStyle.NONE;

    const mockResponseScores = [0.6, 0, 0.9];
    const expectedWidgetVisibilitiesBeforeLoading = [false, false, false];
    const expectedWidgetVisibilitiesWhileLoading = [false, false, false];
    const expectedWidgetVisibilitiesAfterLoading = [false, false, false];
    const expectedFeedbackTextVisibilitiesAfterLoading = [true, false, true];

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading);
  });

  it('Test loading icon visibility, showFeedbackForNeutralScores = false, ',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    // Hide feedback and loading icon for low scores.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = true;
    demoSettings.showFeedbackForNeutralScores = false;

    const mockResponseScores = [0.6, 0, 0.9];
    const expectedWidgetVisibilitiesBeforeLoading = [
      true, // The default score is 0, so at the start it will be visible.
      false,
      true
    ];
    const expectedWidgetVisibilitiesWhileLoading = [true, false, true];
    const expectedWidgetVisibilitiesAfterLoading = [false, true, true];
    const expectedFeedbackTextVisibilitiesAfterLoading = [false, true, true];

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading);
  });

  it('Test loading icon visibility, showFeedbackForNeutralScores = false, emoji icon',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    // Show feedback above a minimum threshold, and only show loading
    // icon above the min threshold.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = true;
    demoSettings.showFeedbackForNeutralScores = false;
    demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;

    const mockResponseScores = [0.6, 0, 0.9];
    const expectedWidgetVisibilitiesBeforeLoading = [
      true, // The default score is 0, so at the start it will be visible.
      false,
      true
    ];
    const expectedWidgetVisibilitiesWhileLoading = [true, false, true];
    const expectedWidgetVisibilitiesAfterLoading = [false, true, true];
    const expectedFeedbackTextVisibilitiesAfterLoading = [false, true, true];
    const widgetId = 'emojiStatusWidget';

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading,
      widgetId);
  });

  it('Test loading icon visibility, showFeedbackForNeutralScores = false, no loading icon',
     async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    // Show feedback above a minimum threshold, and only show loading
    // icon above the min threshold.
    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    demoSettings.showFeedbackForLowScores = true;
    demoSettings.showFeedbackForNeutralScores = false;
    demoSettings.loadingIconStyle = LoadingIconStyle.NONE;

    const mockResponseScores = [0.6, 0, 0.9];
    const expectedWidgetVisibilitiesBeforeLoading = [false, false, false];
    const expectedWidgetVisibilitiesWhileLoading = [false, false, false];
    const expectedWidgetVisibilitiesAfterLoading = [false, false, false];
    const expectedFeedbackTextVisibilitiesAfterLoading = [false, true, true];

    await verifyWidgetVisibilityForDemoSettings(
      fixture,
      httpMock,
      demoSettings,
      mockResponseScores,
      expectedWidgetVisibilitiesBeforeLoading,
      expectedWidgetVisibilitiesWhileLoading,
      expectedWidgetVisibilitiesAfterLoading,
      expectedFeedbackTextVisibilitiesAfterLoading);
  });

  it('Test gradient colors', async(() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    const testGradientColorsRgb = [
      'rgb(130, 224, 170)',
      'rgb(136, 78, 160)',
      'rgb(244, 208, 63)'
    ];
    const testGradientColorsHex = [
      '#82E0AA', // RGB 130, 224, 170
      '#884EA0', // RGB 136, 78, 160
      '#F4D03F'  // RGB 244, 208, 63
    ];
    // Test different low, mid, and high thresholds.
    let demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.gradientColors = testGradientColorsHex;
    demoSettings.neutralScoreThreshold = 0.6;
    demoSettings.toxicScoreThreshold = 0.8;
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();

    const checker = fixture.componentInstance.checker;

    let expectedGradientControlPoints = [Math.floor(checker.statusWidget.getFirstGradientRatio() * 60), 60, 80];
    let actualGradientControlPoints = checker.statusWidget.getAdjustedGradientControlPoints(100);
    expect(actualGradientControlPoints).toEqual(expectedGradientControlPoints);

    verifyColorsAlmostEqual(checker.statusWidget.interpolateColors(0),
                            testGradientColorsRgb[0]);
    verifyInterpolateColorsForControlPointsAndGradientColors(
      checker, actualGradientControlPoints, testGradientColorsRgb);

    // TODO: Figure out why ngOnChanges in PerspectiveStatus doesn't get called
    // between calls to setDemoSettings in this test (and why it does in the
    // above tests for 'Test loading icon style setting change'. When this is
    // fixed, remove calls to updateGradient() in this test.

    // Test different low, mid, and high score thresholds with several decimal
    // places.
    demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.gradientColors = testGradientColorsHex;
    demoSettings.neutralScoreThreshold = 0.6789;
    demoSettings.toxicScoreThreshold = 0.89990;
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();
    checker.statusWidget.updateGradient();

    expectedGradientControlPoints = [
      Math.floor(checker.statusWidget.getFirstGradientRatio() * 67.89), 67, 89];
    actualGradientControlPoints = checker.statusWidget.getAdjustedGradientControlPoints(100);
    expect(actualGradientControlPoints).toEqual(expectedGradientControlPoints);
    verifyColorsAlmostEqual(checker.statusWidget.interpolateColors(0),
                            testGradientColorsRgb[0]);
    verifyInterpolateColorsForControlPointsAndGradientColors(
      checker, actualGradientControlPoints, testGradientColorsRgb);

    // Test equal neutral and toxic thresholds.
    demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.gradientColors = testGradientColorsHex;
    demoSettings.neutralScoreThreshold = 0.75;
    demoSettings.toxicScoreThreshold = 0.75;
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();
    checker.statusWidget.updateGradient();

    expectedGradientControlPoints = [Math.floor(checker.statusWidget.getFirstGradientRatio() * 75), 74, 75];
    actualGradientControlPoints = checker.statusWidget.getAdjustedGradientControlPoints(100);
    expect(actualGradientControlPoints).toEqual(expectedGradientControlPoints);
    verifyColorsAlmostEqual(checker.statusWidget.interpolateColors(0),
                            testGradientColorsRgb[0]);
    verifyInterpolateColorsForControlPointsAndGradientColors(
      checker, actualGradientControlPoints, testGradientColorsRgb);

    // Test equal neutral and toxic score thresholds with several decimal places.
    demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.gradientColors = testGradientColorsHex;
    demoSettings.neutralScoreThreshold = 0.7511111;
    demoSettings.toxicScoreThreshold = 0.7511111;
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();
    checker.statusWidget.updateGradient();

    expectedGradientControlPoints = [Math.floor(checker.statusWidget.getFirstGradientRatio() * 75.11111), 74, 75];
    actualGradientControlPoints = checker.statusWidget.getAdjustedGradientControlPoints(100);
    expect(actualGradientControlPoints).toEqual(expectedGradientControlPoints);
    verifyColorsAlmostEqual(checker.statusWidget.interpolateColors(0),
                            testGradientColorsRgb[0]);
    verifyInterpolateColorsForControlPointsAndGradientColors(
      checker, actualGradientControlPoints, testGradientColorsRgb);

    // Test almost equal neutral and toxic score thresholds.
    demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.gradientColors = testGradientColorsHex;
    demoSettings.neutralScoreThreshold = 0.752;
    demoSettings.toxicScoreThreshold = 0.753;
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();
    checker.statusWidget.updateGradient();

    expectedGradientControlPoints = [
      Math.floor(checker.statusWidget.getFirstGradientRatio() * 75.2), 74, 75];
    actualGradientControlPoints = checker.statusWidget.getAdjustedGradientControlPoints(100);
    expect(actualGradientControlPoints).toEqual(expectedGradientControlPoints);
    verifyColorsAlmostEqual(checker.statusWidget.interpolateColors(0),
                            testGradientColorsRgb[0]);
    verifyInterpolateColorsForControlPointsAndGradientColors(
      checker, actualGradientControlPoints, testGradientColorsRgb);

    // Test neutral threshold of 0.
    demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.gradientColors = testGradientColorsHex;
    demoSettings.neutralScoreThreshold = 0.0;
    demoSettings.toxicScoreThreshold = 0.75;
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();
    checker.statusWidget.updateGradient();

    expectedGradientControlPoints = [-1, 0, 75];
    actualGradientControlPoints = checker.statusWidget.getAdjustedGradientControlPoints(100);
    expect(actualGradientControlPoints).toEqual(expectedGradientControlPoints);
    // First control point is below zero, so the value at 0 is the second color.
    verifyColorsAlmostEqual(checker.statusWidget.interpolateColors(0),
                            testGradientColorsRgb[1]);
    verifyColorsAlmostEqual(checker.statusWidget.interpolateColors(.75),
                            testGradientColorsRgb[2]);

    // Test equal neutral and toxic thresholds of 0.
    demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.gradientColors = testGradientColorsHex;
    demoSettings.neutralScoreThreshold = 0.0;
    demoSettings.toxicScoreThreshold = 0.0;
    fixture.componentInstance.setDemoSettings(demoSettings);
    fixture.detectChanges();
    checker.statusWidget.updateGradient();

    expectedGradientControlPoints = [-2, -1, 0];
    actualGradientControlPoints = checker.statusWidget.getAdjustedGradientControlPoints(100);
    expect(actualGradientControlPoints).toEqual(expectedGradientControlPoints);
    // First and second control points are below zero, so the value at 0 is the third color.
    verifyColorsAlmostEqual(checker.statusWidget.interpolateColors(0),
                            testGradientColorsRgb[2]);
    verifyColorsAlmostEqual(checker.statusWidget.interpolateColors(1),
                            testGradientColorsRgb[2]);
  }));

  it('Test JSON DemoSettings', async(() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerJsonDemoSettingsComponent);
    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;

    const expectedDemoSettings = JSON.parse(fixture.componentInstance.getDemoSettingsJson());
    expect(checker.demoSettings).toEqual(expectedDemoSettings);
    expect(checker.demoSettings).not.toEqual(getCopyOfDefaultDemoSettings());
  }));

  it('Test correct visibility of loading icon after loadingIconStyle change', async() => {
    const fixture = TestBed.createComponent(test_components.ConvaiCheckerCustomDemoSettingsComponent);
    fixture.detectChanges();
    const checker = fixture.componentInstance.checker;

    // Change back and forth between different LoadingIconStyles without any
    // visibility restrictions. Icons for the respective icon type should be
    // visible (or hidden for LoadingIconStyle.NONE).
    verifyCircleSquareDiamondWidgetVisible();

    const demoSettings = getCopyOfDefaultDemoSettings();
    demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    verifyEmojiWidgetVisible();

    demoSettings.loadingIconStyle = LoadingIconStyle.CIRCLE_SQUARE_DIAMOND;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    verifyCircleSquareDiamondWidgetVisible();

    demoSettings.loadingIconStyle = LoadingIconStyle.NONE;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    verifyNoLoadingIconState();

    demoSettings.loadingIconStyle = LoadingIconStyle.CIRCLE_SQUARE_DIAMOND;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    verifyCircleSquareDiamondWidgetVisible();

    demoSettings.loadingIconStyle = LoadingIconStyle.NONE;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    verifyNoLoadingIconState();

    demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    verifyEmojiWidgetVisible();

    demoSettings.loadingIconStyle = LoadingIconStyle.NONE;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    verifyNoLoadingIconState();

    // Change back and forth while hiding icon for low scores (default score is
    // 0). Icons for the respective icon type should exist in the DOM, but
    // should be hidden.
    demoSettings.loadingIconStyle = LoadingIconStyle.CIRCLE_SQUARE_DIAMOND;
    demoSettings.showFeedbackForLowScores = false;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    expect(getElementExists('circleSquareDiamondWidget')).toBe(true);
    expect(getIsElementWithIdVisible('circleSquareDiamondWidget')).toBe(false);
    expect(getElementExists('emojiStatusWidget')).toBe(false);

    demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    expect(getElementExists('emojiStatusWidget')).toBe(true);
    expect(getIsElementWithIdVisible('emojiStatusWidget')).toBe(false);
    expect(getElementExists('circleSquareDiamondWidget')).toBe(false);

    demoSettings.loadingIconStyle = LoadingIconStyle.CIRCLE_SQUARE_DIAMOND;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    expect(getElementExists('circleSquareDiamondWidget')).toBe(true);
    expect(getIsElementWithIdVisible('circleSquareDiamondWidget')).toBe(false);
    expect(getElementExists('emojiStatusWidget')).toBe(false);

    demoSettings.loadingIconStyle = LoadingIconStyle.NONE;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    verifyNoLoadingIconState();

    demoSettings.loadingIconStyle = LoadingIconStyle.CIRCLE_SQUARE_DIAMOND;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    expect(getElementExists('circleSquareDiamondWidget')).toBe(true);
    expect(getIsElementWithIdVisible('circleSquareDiamondWidget')).toBe(false);
    expect(getElementExists('emojiStatusWidget')).toBe(false);

    demoSettings.loadingIconStyle = LoadingIconStyle.NONE;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    verifyNoLoadingIconState();

    demoSettings.loadingIconStyle = LoadingIconStyle.EMOJI;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    expect(getElementExists('emojiStatusWidget')).toBe(true);
    expect(getIsElementWithIdVisible('emojiStatusWidget')).toBe(false);
    expect(getElementExists('circleSquareDiamondWidget')).toBe(false);

    demoSettings.loadingIconStyle = LoadingIconStyle.NONE;
    await updateDemoSettingsAndWaitForAnimation(fixture, demoSettings);
    verifyNoLoadingIconState();
  });
});
