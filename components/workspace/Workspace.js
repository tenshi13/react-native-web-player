import React, { Component } from 'react'
import pureRender from 'pure-render-decorator'

import Header from './Header'
import Editor from './Editor'
import PlayerFrame from './PlayerFrame'
import Status from './Status'
import Overlay from './Overlay'
import Button from './Button'
import About from './About'
import Tabs from './Tabs'
import Fullscreen from './Fullscreen'
import { getErrorDetails } from '../../utils/ErrorMessage'
import { prefixObject } from '../../utils/PrefixInlineStyles'

const BabelWorker = require("worker!../../babel-worker.js")
const babelWorker = new BabelWorker()

// Utilities for determining which babel worker responses are for the player vs
// the transpiler view, since we encode this information in the filename.
const transpilerPrefix = '@babel-'
const getTranspilerId = (filename) => `${transpilerPrefix}${filename}`
const isTranspilerId = (filename) => filename.indexOf(transpilerPrefix) === 0

const styles = prefixObject({
  container: {
    flex: '1',
    display: 'flex',
    alignItems: 'stretch',
    minWidth: 0,
    minHeight: 0,
  },
  editorPane: {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden', // Clip box shadows
  },
  transpilerPane: {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden', // Clip box shadows
  },
  playerPane: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    marginLeft: 10,
    marginRight: 10,
  },
  overlayContainer: {
    position: 'relative',
    flex: 0,
    height: 0,
    alignItems: 'stretch',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    background: 'rgba(255,255,255,0.95)',
    zIndex: 100,
    left: 4,
    right: 0,
    borderTop: '1px solid #F8F8F8',
    display: 'flex',
    alignItems: 'stretch',
  },
})

@pureRender
export default class extends Component {

  static defaultProps = {
    title: 'Live Editor',
    files: {['index.js']: ''},
    entry: 'index.js',
    initialTab: 'index.js',
    onChange: () => {},
    platform: null,
    scale: null,
    width: null,
    assetRoot: null,
    vendorComponents: [],
    externalStyles: {},
    fullscreen: false,
    panes: [],
  }

  constructor(props) {
    super()

    const {initialTab, panes} = props

    this.state = {
      compilerError: null,
      runtimeError: null,
      showDetails: false,
      activeTab: initialTab,
      transpilerCache: {},
      transpilerVisible: panes.indexOf('transpiler') >= 0,
      playerVisible: panes.indexOf('player') >= 0,
    }

    this.codeCache = {}
    this.playerCache = {}

    babelWorker.addEventListener("message", this.onBabelWorkerMessage)
  }

  componentWillUnmount() {
    babelWorker.removeEventListener("message", this.onBabelWorkerMessage)
  }

  componentDidMount() {
    if (typeof navigator !== 'undefined') {
      const {files} = this.props
      const {playerVisible, transpilerVisible} = this.state

      // Cache and compile each file
      Object.keys(files).forEach(filename => {
        const code = files[filename]

        this.codeCache[filename] = code

        if (playerVisible) {
          babelWorker.postMessage({
            filename,
            code,
            options: {retainLines: true},
          })
        }

        if (transpilerVisible) {
          babelWorker.postMessage({
            filename: getTranspilerId(filename),
            code,
          })
        }
      })
    }
  }

  runApplication = () => {
    const {playerCache} = this
    const {entry} = this.props
    const {player} = this.refs

    player.runApplication(playerCache, entry)
  }

  onBabelWorkerMessage = ({data}) => {
    const {playerCache} = this
    const {files} = this.props
    const {transpilerCache} = this.state
    const {filename, type, code, error} = JSON.parse(data)

    this.updateStatus(type, error)

    if (type === 'code') {
      if (isTranspilerId(filename)) {
        this.setState({
          transpilerCache: {
            ...transpilerCache,
            [filename]: code,
          },
        })
      } else {
        playerCache[filename] = code

        // Run the app once we've transformed each file at least once
        if (Object.keys(files).every(filename => playerCache[filename])) {
          this.runApplication()
        }
      }
    }
  }

  updateStatus = (type, error) => {
    switch (type) {
      case 'code':
        this.setState({
          compilerError: null,
          showDetails: false,
        })
      break
      case 'error':
        this.setState({
          compilerError: getErrorDetails(error.message)
        })
      break
    }
  }

  onCodeChange = (code) => {
    const {activeTab, transpilerVisible, playerVisible} = this.state

    if (playerVisible) {
      babelWorker.postMessage({
        filename: activeTab,
        code,
        options: {retainLines: true},
      })
    }

    if (transpilerVisible) {
      babelWorker.postMessage({
        filename: getTranspilerId(activeTab),
        code,
      })
    }

    this.codeCache[activeTab] = code
    this.props.onChange(this.codeCache)
  }

  onToggleDetails = (showDetails) => {
    this.setState({showDetails})
  }

  onPlayerRun = () => {
    this.setState({runtimeError: null})
  }

  // TODO: Runtime errors should indicate which file they're coming from,
  // and only cause a line highlight on that file.
  onPlayerError = (message) => {
    this.setState({runtimeError: getErrorDetails(message)})
  }

  onClickTab = (tab) => {
    this.setState({activeTab: tab})
  }

  renderEditor = (key) => {
    const {files, title, externalStyles, fullscreen} = this.props
    const {compilerError, runtimeError, showDetails, activeTab} = this.state

    const filenames = Object.keys(files)

    const error = compilerError || runtimeError
    const isError = !! error

    return (
      <div key={key} style={styles.editorPane}>
        {title && (
          <Header
            text={title}
            headerStyle={externalStyles.header}
            textStyle={externalStyles.headerText}
          >
            {fullscreen && (
              <Fullscreen textStyle={externalStyles.headerText} />
            )}
          </Header>
        )}
        {filenames.length > 1 && (
          <Tabs
            tabs={filenames}
            activeTab={activeTab}
            onClickTab={this.onClickTab}
            tabStyle={externalStyles.tab}
            textStyle={externalStyles.tabText}
            activeTextStyle={externalStyles.tabTextActive}
          >
            {fullscreen && !title && (
              <Fullscreen textStyle={externalStyles.tabText} />
            )}
          </Tabs>
        )}
        <Editor
          key={activeTab}
          initialValue={files[activeTab]}
          filename={activeTab}
          onChange={this.onCodeChange}
          errorLineNumber={isError && error.lineNumber}
        />
        {showDetails && (
          <div style={styles.overlayContainer}>
            <div style={styles.overlay}>
              <Overlay isError={isError}>
                {isError ? error.description + '\n\n' : ''}
                <About />
              </Overlay>
            </div>
          </div>
        )}
        <Status
          text={isError ? error.summary : 'No Errors'}
          isError={isError}
        >
          <Button
            active={showDetails}
            isError={isError}
            onChange={this.onToggleDetails}
          >
            {'Show Details'}
          </Button>
        </Status>
      </div>
    )
  }

  renderTranspiler = (key) => {
    const {externalStyles, transpilerTitle} = this.props
    const {activeTab, transpilerCache} = this.state

    return (
      <div key={key} style={styles.transpilerPane}>
        {transpilerTitle && (
          <Header
            text={transpilerTitle}
            headerStyle={externalStyles.transpilerHeader}
            textStyle={externalStyles.transpilerHeaderText}
          />
        )}
        <Editor
          key={getTranspilerId(activeTab)}
          readOnly={true}
          value={transpilerCache[getTranspilerId(activeTab)]}
          filename={getTranspilerId(activeTab)}
        />
      </div>
    )
  }

  renderPlayer = (key) => {
    const {width, scale, platform, assetRoot, vendorComponents} = this.props

    return (
      <div key={key} style={styles.playerPane}>
        <PlayerFrame
          ref={'player'}
          width={width}
          scale={scale}
          platform={platform}
          assetRoot={assetRoot}
          vendorComponents={vendorComponents}
          onRun={this.onPlayerRun}
          onError={this.onPlayerError}
        />
      </div>
    )
  }

  render() {
    const {panes} = this.props

    const renderPane = {
      editor: this.renderEditor,
      transpiler: this.renderTranspiler,
      player: this.renderPlayer,
    }

    return (
      <div style={styles.container}>
        {panes.map((pane, i) => renderPane[pane](i))}
      </div>
    )
  }
}
